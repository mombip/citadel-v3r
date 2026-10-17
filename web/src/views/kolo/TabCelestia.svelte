<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post, del } from "../../lib/api";
  import { celestiaColor, ratingFor, PRIME, MEDIUM, RISK } from "../../../../shared/celestia";
  import { addDays, formatTimePL } from "../../../../shared/dates";
  import { fmt, glow, voteStyle, kdiCellStyle } from "../../lib/format";
  import { celestiaDistributionFigure } from "../../lib/charts";
  import Tabs from "../../components/Tabs.svelte";
  import BentoCard from "../../components/BentoCard.svelte";
  import Plot from "../../components/Plot.svelte";
  import Radio from "../../components/Radio.svelte";
  import DataTable from "../../components/DataTable.svelte";
  import Alert from "../../components/Alert.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();
  let sub = $state(0);
  const isLight = $derived(app.isLight);

  // ---------------- Ranking
  const ranking = $derived([...members].sort((a, b) => (b.celestia_score ?? 0) - (a.celestia_score ?? 0)));
  const total = $derived(ranking.length);
  const nPrime = $derived(ranking.filter((d) => PRIME.includes(d.celestia_rating)).length);
  const nMed = $derived(ranking.filter((d) => MEDIUM.includes(d.celestia_rating)).length);
  const nRisk = $derived(ranking.filter((d) => RISK.includes(d.celestia_rating)).length);
  const scores = $derived(ranking.map((d) => d.celestia_score ?? 0));
  const median = $derived.by(() => {
    if (!scores.length) return 0;
    const s = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    return Math.round(m);
  });
  const mean = $derived(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(total, 1)) : 0);
  const defMean = $derived(ratingFor(mean));
  const defMedian = $derived(ratingFor(median));
  const colMean = $derived(isLight ? defMean.kolor_light : defMean.kolor_dark);
  const pct = (n: number) => fmt(total > 0 ? (n / total) * 100 : 0, 1);
  const counts = $derived.by(() => {
    const c: Record<string, number> = {};
    for (const d of ranking) c[d.celestia_rating ?? "DDD"] = (c[d.celestia_rating ?? "DDD"] ?? 0) + 1;
    return c;
  });

  const filtry = ["Wszyscy", "Tylko Prime (AAA — A)", "Tylko Średnia (BBB — B)", "Tylko Zagrożeni (CCC — DDD)"];
  let filtr = $state("Wszyscy");
  const filtered = $derived.by(() => {
    if (filtr === filtry[1]) return ranking.filter((d) => PRIME.includes(d.celestia_rating));
    if (filtr === filtry[2]) return ranking.filter((d) => MEDIUM.includes(d.celestia_rating));
    if (filtr === filtry[3]) return ranking.filter((d) => RISK.includes(d.celestia_rating));
    return ranking;
  });
  const rankRows = $derived(filtered.map((d, i) => ({
    pozycja: i + 1, czlonek: d.imie_nazwisko, rating: d.celestia_rating ?? "DDD", score: `${d.celestia_score ?? 0} pkt`,
    vdc: d.celestia_filary?.vdc_score != null ? `${d.celestia_filary.vdc_score} pkt` : "Brak głosowań",
    kdi: d.kdi_str, saldo: `${fmt(d.saldo_akt_pln, 2)} zł`, glos: d.glosowanie_str,
  })));
  const pktStyle = (v: string, fallback = "") => {
    const n = parseInt(String(v).replace(" pkt", "").trim());
    return isNaN(n) ? fallback : `color: ${celestiaColor(n, isLight)}; font-weight: 800;`;
  };

  // ---------------- Register of due dates
  const kategorie = ["🗳️ Głosowanie / Zebranie (wpływa na prawo głosu VDC)", "📆 Zbiórka Kwartalna (wpływa na rytm wpłat, bez praw głosu)"];
  let kategoria = $state(kategorie[0]);
  const czyGlos = $derived(kategoria.includes("Głosowanie"));
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let data = $state(today);
  let wagaGlos = $state("Zwyczajne (waga 1.0)");
  let wagaKw = $state("Standardowa zbiórka kwartału (waga 1.0)");
  let dniPrzed = $state(14);
  let dniPo = $state(0);
  let touched = $state(false);
  $effect(() => {
    // Defaults follow the category until the user edits them (Streamlit resets the widgets on category change).
    const g = czyGlos;
    if (!touched) { dniPrzed = g ? 14 : 21; dniPo = g ? 0 : 3; }
  });
  const waga = $derived((czyGlos ? wagaGlos : wagaKw).includes("1.5") ? 1.5 : 1.0);
  const dataOd = $derived(addDays(data, -Math.trunc(dniPrzed)));
  const dataDo = $derived(addDays(data, Math.trunc(dniPo)));
  const dniLacznie = $derived(Math.trunc(dniPrzed) + 1);
  let nazwa = $state("");
  let opis = $state("");
  let formError = $state("");
  let formOk = $state("");

  async function addTermin(e: Event) {
    e.preventDefault();
    formError = "";
    formOk = "";
    if (!nazwa.trim()) return void (formError = "Wprowadź nazwę wydarzenia!");
    try {
      await post(`/kolo/${koloId}/terminy`, {
        data_glosowania: data, nazwa, opis, dni_zbiorki_przed: Math.trunc(dniPrzed), dni_wymagalnosci_po: Math.trunc(dniPo),
        waga, typ_terminu: czyGlos ? "GLOSOWANIE" : "KWARTALNY", data_zbiorki_od: dataOd, data_wymagalnosci_do: dataDo,
      });
      formOk = `Pomyślnie zarejestrowano termin: '${nazwa}' (${czyGlos ? "Głosowanie VDC" : "Zbiórka Kwartalna"}).`;
      nazwa = "";
      opis = "";
      app.refresh();
    } catch (err: any) {
      formError = err.message;
    }
  }

  let terminy = $state<any[]>([]);
  $effect(() => {
    app.version;
    get(`/kolo/${koloId}/terminy`).then((t) => (terminy = t));
  });
  const terminRows = $derived(terminy.map((r) => {
    const dniP = Math.trunc(Number(r.dni_zbiorki_przed ?? 14));
    const dniA = Math.min(3, Math.max(0, Math.trunc(Number(r.dni_wymagalnosci_po ?? 0))));
    const typ = String(r.typ_terminu || "GLOSOWANIE").toUpperCase();
    const dOd = r.data_zbiorki_od ?? addDays(r.data_glosowania, -dniP);
    const dDo = addDays(r.data_glosowania, dniA);
    return {
      id: r.id,
      kategoria: typ === "GLOSOWANIE" ? "🗳️ Głosowanie" : "📆 Zbiórka Kwartalna",
      data: r.data_glosowania,
      nazwa: r.nazwa,
      okno: `${dOd} → ${r.data_glosowania} (${(dniPrzedOf(dOd, r.data_glosowania))} dni)`,
      poslizg: dniA > 0 ? `${dniA} dni (do ${dDo})` : "Brak poślizgu (0 dni)",
      waga: `${fmt(Number(r.waga ?? 1), 1)}x`,
      opis: r.opis || "—",
      zarejestrowal: r.dodal_imie || "System",
      wpis: formatTimePL(r.utworzono_o),
      typ,
    };
  }));
  function dniPrzedOf(od: string, g: string) {
    return Math.round((Date.parse(g) - Date.parse(od)) / 86400000) + 1;
  }
  const usunOptions = $derived(terminRows.map((r) => [r.id, `[${r.typ === "GLOSOWANIE" ? "Głosowanie" : "Zbiórka Q"}] ${r.data} — ${r.nazwa}`] as [number, string]));
  let usunId = $state<number | null>(null);
  async function usunTermin() {
    if (usunId == null) return;
    await del(`/kolo/${koloId}/terminy/${usunId}`);
    app.toast("success", "Usunięto wybrany termin wymagalności. Przeliczono ratingi.");
    app.refresh();
  }
</script>

<h3>⭐ Panel Celestia — Rating Wypłacalności i Dni Zapadalności</h3>
<p class="caption">Celestia to zaawansowany rating dyscypliny składkowej członków. Głównym wyznacznikiem wiarygodności jest wywiązywanie się ze składek w okolicy faktycznych terminów zapadalności — którymi w życiu koła są dni zebrań i głosowań.</p>

<Tabs labels={["🏆 Tablica Wiarygodności & Ranking", "🗳️ Rejestr Dni Głosowań (Zapadalności)"]} bind:active={sub} testid="celestia-tabs" />

{#if sub === 0}
  {#if !members.length}
    <Alert kind="info" html="Brak danych członków w tym kole." />
  {:else}
    <div class="cols" data-testid="celestia-cards">
      <div class="col"><BentoCard title="Indeks Wiarygodności Koła" value={`${defMean.kod} (${mean} pkt)`} sub={`Mediana Celestia: ${defMedian.kod} (${median} pkt)`} style={glow(colMean, 14)} /></div>
      <div class="col"><BentoCard title="Klasa Prime (AAA — A)" value={`${nPrime} / ${total}`} sub={`${pct(nPrime)}% członków wzorowych`} style={glow(celestiaColor("AA", isLight), 14)} /></div>
      <div class="col"><BentoCard title="Klasa Średnia (BBB — B)" value={`${nMed} / ${total}`} sub={`${pct(nMed)}% stabilnych / umiarkowanych`} style={glow(celestiaColor("BB", isLight), 14)} /></div>
      <div class="col"><BentoCard title="Zagrożeni (CCC — DDD)" value={`${nRisk} / ${total}`} sub={`${pct(nRisk)}% ryzyko utraty praw głosu`} style={glow(celestiaColor("CCC", isLight), 14)} /></div>
    </div>

    <h4>📊 Rozkład Poziomów Ratingowych w Kole</h4>
    <Plot figure={celestiaDistributionFigure(counts, isLight)} />

    <h4>📋 Szczegółowy Ranking Wiarygodności Członków</h4>
    <Radio options={filtry} bind:value={filtr} name="filtr-rating" />
    <DataTable testid="ranking-table" columns={[
      { key: "pozycja", label: "Pozycja", numeric: true }, { key: "czlonek", label: "Członek" },
      { key: "rating", label: "Rating Celestia", style: (v: string) => `color: ${celestiaColor(v, isLight)}; font-weight: 800; font-size: 1.05rem;` },
      { key: "score", label: "Score (0-1000)", style: (v: string) => pktStyle(v) },
      { key: "vdc", label: "Dyscyplina Głosowań (VDC)", style: (v: string) => pktStyle(v, "color: #94a3b8;") },
      { key: "kdi", label: "KDI", style: (v: string) => kdiCellStyle(v, isLight) }, { key: "saldo", label: "Saldo Aktualne" },
      { key: "glos", label: "Uprawnienie do głosu", style: voteStyle },
    ]} rows={rankRows} />
  {/if}
{:else}
  <h4>🗳️ Rejestr Dni Głosowań i Wymagalności Koła</h4>
  <div class="caption">
    Wprowadź oficjalne terminy zapadalności dla koła. System obsługuje dwa rodzaje wydarzeń:<br />
    1. <strong>🗳️ Głosowanie / Zebranie koła</strong> — punkt weryfikacji prawa głosu (filar VDC — 65% ratingu).<br />
    2. <strong>📆 Zbiórka kwartalna / Dzień wymagalności</strong> — wyznacza kwartalny rytm wpłat (filar Rytmu — <strong>nie zalicza się jako głosowanie</strong> i nie zaburza praw głosu).
  </div>

  <h5>➕ Nowe Wydarzenie / Termin Wymagalności</h5>
  <p class="caption">Skonfiguruj kategorię, datę oraz okno zbiórki. Zmiana parametrów natychmiast przelicza podgląd na żywo.</p>
  <Radio label="Kategoria terminu wymagalności:" options={kategorie} bind:value={kategoria} name="kategoria-terminu" />

  <div class="cols">
    <div class="col">
      <div class="field"><label for="t-data">{czyGlos ? "Data Głosowania / Zebrania:" : "Data Wymagalności Kwartalnej:"}</label><input id="t-data" class="input" type="date" bind:value={data} /></div>
    </div>
    <div class="col">
      {#if czyGlos}
        <Select label="Ranga wydarzenia:" options={[["Zwyczajne (waga 1.0)", "Zwyczajne (waga 1.0)"], ["Kluczowe / Wybory Władz (waga 1.5)", "Kluczowe / Wybory Władz (waga 1.5)"]]} bind:value={wagaGlos} name="waga" />
      {:else}
        <Select label="Ranga zbiórki kwartalnej:" options={[["Standardowa zbiórka kwartału (waga 1.0)", "Standardowa zbiórka kwartału (waga 1.0)"], ["Priorytetowa zbiórka zamknięcia roku / budżetu (waga 1.5)", "Priorytetowa zbiórka zamknięcia roku / budżetu (waga 1.5)"]]} bind:value={wagaKw} name="waga-kw" />
      {/if}
    </div>
  </div>
  <div class="cols">
    <div class="col" style="flex: 1"><div onfocusin={() => (touched = true)}><NumberInput label="Długość zbiórki (dni przed):" bind:value={dniPrzed} min={1} max={90} step={1} decimals={0} name="dni-przed" /></div></div>
    <div class="col" style="flex: 1"><div onfocusin={() => (touched = true)}><NumberInput label="Dopuszczalny poślizg (dni po terminie):" bind:value={dniPo} min={0} max={3} step={1} decimals={0} name="dni-po" /></div></div>
    <div class="col" style="flex: 2">
      <Alert kind="info" html={`📅 <strong>${czyGlos ? "Okno zbiórki przed zebraniem:" : "Okno zbiórki kwartalnej:"}</strong> od <strong>${dataOd}</strong> do <strong>${data}</strong> (${dniLacznie} dni na terminową wpłatę)${dniPo > 0 ? ` + poślizg do <strong>${dataDo}</strong> (${Math.trunc(dniPo)} dni)` : " (brak poślizgu — termin do dnia wydarzenia)"}.`} />
    </div>
  </div>

  <form class="form-card" onsubmit={addTermin} data-testid="form-termin">
    <div class="field"><label for="t-nazwa">Nazwa / Okazja wydarzenia:</label><input id="t-nazwa" class="input" bind:value={nazwa} placeholder={czyGlos ? "np. Walne Zebranie Członków, Wybory Władz Koła" : "np. Zbiórka składek za I kwartał 2026, Rozliczenie Q2"} /></div>
    <div class="field"><label for="t-opis">Opcjonalny opis / uwagi:</label><input id="t-opis" class="input" bind:value={opis} placeholder="np. Wymóg braku zadłużenia na dzień otwarcia obrad" /></div>
    <button class="btn full" type="submit">{czyGlos ? "➕ Zarejestruj Termin Głosowania" : "➕ Zarejestruj Zbiórkę Kwartalną"}</button>
    {#if formError}<div class="mt"><Alert kind="error" html={formError} /></div>{/if}
    {#if formOk}<div class="mt"><Alert kind="success" html={formOk} /></div>{/if}
  </form>

  <hr />
  <h4>📅 Zarejestrowane Terminy Głosowań i Wymagalności w Kole</h4>
  {#if !terminy.length}
    <Alert kind="info" html="Koło nie ma jeszcze zarejestrowanych terminów. Użyj powyższego formularza, aby dodać pierwsze zebranie lub zbiórkę kwartalną!" />
  {:else}
    <DataTable testid="terminy-table" columns={[
      { key: "kategoria", label: "Kategoria" }, { key: "data", label: "Data Terminu" }, { key: "nazwa", label: "Nazwa Wydarzenia" }, { key: "okno", label: "Okno Zbiórki" },
      { key: "poslizg", label: "Dopuszczalny Poślizg" }, { key: "waga", label: "Ranga / Waga" }, { key: "opis", label: "Opis" }, { key: "zarejestrowal", label: "Zarejestrował" }, { key: "wpis", label: "Data Wpisu" },
    ]} rows={terminRows} />

    <h5>🗑️ Usuwanie terminu wymagalności</h5>
    <div class="cols">
      <div class="col" style="flex: 3"><Select options={usunOptions} bind:value={usunId} name="usun-termin" /></div>
      <div class="col" style="flex: 1"><button class="btn secondary full" type="button" onclick={usunTermin} data-testid="btn-usun-termin">Usuń wybrany termin</button></div>
    </div>
  {/if}
{/if}
