<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get } from "../../lib/api";
  import { filterInterval, INTERVALS, type IntervalCode } from "../../../../shared/calculations";
  import { celestiaColor } from "../../../../shared/celestia";
  import { fmt, zl, kdiColor, glow } from "../../lib/format";
  import { pyFloatStr } from "../../../../shared/num";
  import { balanceFigure, kdiFigure } from "../../lib/charts";
  import Select from "../../components/Select.svelte";
  import Radio from "../../components/Radio.svelte";
  import Tabs from "../../components/Tabs.svelte";
  import Plot from "../../components/Plot.svelte";
  import DataTable from "../../components/DataTable.svelte";
  import BentoCard from "../../components/BentoCard.svelte";
  import Alert from "../../components/Alert.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();

  let selected = $state<number | null>(null);
  let interval = $state<string>("D1");
  let chartTab = $state(0);
  let profile = $state<any>(null);
  let error = $state("");

  const options = $derived(members.map((d) => [d.id, `${d.imie_nazwisko} (Saldo: ${fmt(d.saldo_akt_pln, 2)} zł, KDI: ${d.kdi_str}, Celestia: ${d.celestia_rating ?? "—"})`] as [number, string]));
  const osoba = $derived(members.find((m) => m.id === selected) ?? members[0]);

  $effect(() => {
    app.version;
    const id = osoba?.id;
    if (!id) return;
    profile = null;
    get(`/kolo/${koloId}/members/${id}/profile`).then((p) => (profile = p)).catch((e) => (error = e.message));
  });

  const isLight = $derived(app.isLight);
  const colKdi = $derived(kdiColor(osoba?.kdi_val, isLight));
  const colProg = $derived(osoba?.kdi_prog_val != null ? kdiColor(osoba.kdi_prog_val, isLight) : "#10b981");
  const colGlos = $derived(osoba?.moze_glosowac ? "#10b981" : "#f43f5e");
  const colCel = $derived(celestiaColor(osoba?.celestia_rating ?? "DDD", isLight));

  const records = $derived(profile ? filterInterval(profile.daily, interval as IntervalCode) : []);
  const x = $derived(records.map((r: any) => r.date_str));
  const figSaldo = $derived(balanceFigure(x, records.map((r: any) => r.saldo), isLight));
  const figKdi = $derived(kdiFigure(x, records.map((r: any) => r.kdi), osoba?.kdi_val ?? null, isLight));

  const filary = $derived(osoba?.celestia_filary ?? {});
  const score = $derived(osoba?.celestia_score ?? 0);
  const colScore = $derived(celestiaColor(score, isLight));
  const pillarStyle = (v: number) => glow(celestiaColor(v, isLight), 14);
  const ocenaStyle = (v: string) => {
    const n = Math.trunc(Number(String(v).replace(" pkt", "").trim()));
    return isNaN(n) ? "" : `color: ${celestiaColor(n * 10, isLight)}; font-weight: 800;`;
  };
  const kadencja = $derived.by(() => {
    const k = filary.kadencja_dni;
    const txt = k != null ? `Śr. co ${fmt(k, 0)} dni` : `${profile?.wplaty?.length ?? 0} wpłat`;
    const q = filary.liczba_kwartalnych ?? 0;
    return q > 0 ? `${txt} | Zbiórki Q: ${q}` : `Kadencja: ${txt} (kwartalna)`;
  });
</script>

{#if !members.length}
  <Alert kind="info" html="Brak danych do analizy." />
{:else}
  <Select label="Wybierz członka do analizy wskaźników" {options} bind:value={selected} name="profil-czlonek" />

  <div class="profile-banner-card" data-testid="profile-banner">
    <div><span class="lbl">CZŁONEK:</span> <strong style="font-size: 1rem;">{osoba.imie_nazwisko}</strong></div>
    <div><span class="lbl">CELESTIA:</span> <strong style="color: {colCel}; font-size: 1.15rem; text-shadow: 0 0 10px {colCel};">{osoba.celestia_rating ?? "—"} ({osoba.celestia_score ?? 0} pkt)</strong></div>
    <div><span class="lbl">AKTUALNY KDI:</span> <strong style="color: {colKdi}; font-size: 1.15rem; text-shadow: 0 0 10px {colKdi};">{osoba.kdi_str}</strong> <span style="font-size: 0.82rem; font-weight: 600; color: {colProg}; text-shadow: 0 0 8px {colProg}; margin-left: 4px;">(próg głosu: {osoba.kdi_prog_str ?? "—"})</span></div>
    <div><span class="lbl">SALDO:</span> <strong style="color: {osoba.saldo_akt_pln >= 0 ? '#22c55e' : '#f43f5e'}; font-size: 1rem;">{fmt(osoba.saldo_akt_pln, 2)} zł</strong></div>
    <div><span class="lbl">GŁOSOWANIE:</span> <strong style="color: {colGlos}; font-size: 1.05rem; font-weight: 800;">{osoba.glosowanie_str}</strong></div>
  </div>

  {#if error}
    <Alert kind="error" html={error} />
  {:else if !profile}
    <div class="spinner">Ładowanie…</div>
  {:else}
    <Radio label="Interwał wykresu" options={INTERVALS} bind:value={interval} name="interwal" />
    <Tabs labels={["📉 Oś Czasu Salda (PLN)", "🎯 Dynamika Wskaźnika KDI"]} bind:active={chartTab} testid="profile-chart-tabs" />
    {#if chartTab === 0}<Plot figure={figSaldo} />{:else}<Plot figure={figKdi} />{/if}

    <div class="cols mt">
      <div class="col">
        <p><strong>Historia Wpłat</strong></p>
        {#if profile.wplaty.length}
          <DataTable columns={[{ key: "id", label: "id", numeric: true }, { key: "data_wplaty", label: "data_wplaty" }, { key: "kwota", label: "Kwota" }, { key: "notatka", label: "notatka" }]}
            rows={profile.wplaty.map((w: any) => ({ ...w, kwota: zl(w.kwota_gr) }))} testid="hist-wplaty" />
        {:else}<p class="caption">Brak wpłat.</p>{/if}
      </div>
      <div class="col">
        <p><strong>Ręczne Naliczenia</strong></p>
        {#if profile.reczne.length}
          <DataTable columns={[{ key: "data_naliczenia", label: "data_naliczenia" }, { key: "kwota", label: "Kwota" }, { key: "tytul", label: "tytul" }]}
            rows={profile.reczne.map((w: any) => ({ ...w, kwota: zl(w.kwota_gr) }))} testid="hist-reczne" />
        {:else}<p class="caption">Brak ręcznych naliczeń.</p>{/if}
      </div>
      <div class="col">
        <p><strong>Historia Korekt Salda</strong></p>
        {#if profile.korekty.length}
          <DataTable columns={[{ key: "data_korekty", label: "data_korekty" }, { key: "delta", label: "Delta" }, { key: "docelowe", label: "Docelowe" }, { key: "powod", label: "powod" }]}
            rows={profile.korekty.map((k: any) => ({ ...k, delta: `${fmt(k.delta_gr / 100, 2, { sign: true })} zł`, docelowe: zl(k.docelowe_saldo_gr) }))} testid="hist-korekty" />
        {:else}<p class="caption">Brak korekt.</p>{/if}
      </div>
    </div>

    <hr />
    <h3>⭐ Celestia — Audyt Wiarygodności i Dni Głosowań</h3>
    <p>
      Klasa wiarygodności: <strong style="color: {colScore}; font-size: 1.1rem; text-shadow: 0 0 10px {colScore};">{osoba.celestia_nazwa ?? "Brak"} ({osoba.celestia_rating ?? "—"})</strong> |
      Score: <strong style="color: {colScore}; font-size: 1.1rem; text-shadow: 0 0 10px {colScore};">{score} / 1000 pkt</strong> |
      {osoba.celestia_opis ?? "—"}
    </p>

    <div class="cols" data-testid="celestia-pillars">
      <div class="col">
        <BentoCard title="Dyscyplina Głosowań (65%)" value={filary.vdc_score != null ? `${filary.vdc_score} pkt` : "Brak zebrań"}
          sub={filary.vdc_score != null ? `W oparciu o ${filary.liczba_glosowan ?? 0} głosowań` : "Brak zarejestrowanych zebrań"}
          style={filary.vdc_score != null ? pillarStyle(filary.vdc_score) : "color: #94a3b8;"} />
      </div>
      <div class="col"><BentoCard title="Wskaźnik KDI (10%)" value={`${filary.kdi_score ?? 0} pkt`} sub={`KDI: ${osoba.kdi_str} (próg: ${osoba.kdi_prog_str ?? "—"})`} style={pillarStyle(filary.kdi_score ?? 0)} /></div>
      <div class="col"><BentoCard title="Bieżące Saldo (20%)" value={`${filary.saldo_score ?? 0} pkt`} sub={`Saldo: ${fmt(osoba.saldo_akt_pln, 2)} zł`} style={pillarStyle(filary.saldo_score ?? 0)} /></div>
      <div class="col"><BentoCard title="Rytm Płatności (5%)" value={`${filary.rytm_score ?? 0} pkt`} sub={kadencja} style={pillarStyle(filary.rytm_score ?? 0)} /></div>
    </div>

    {#if osoba.celestia_audyt_glosowan?.length}
      <h4>🗳️ Historia Dyscypliny na Głosowaniach Koła</h4>
      <p class="caption">Ocena salda oraz wpłat w skonfigurowanym oknie zbiórki przed każdym terminem zapadalności:</p>
      <DataTable testid="audyt-glosowan" columns={[
        { key: "data_glosowania", label: "Data Głosowania" }, { key: "nazwa", label: "Wydarzenie / Zebranie" }, { key: "okres_zbiorki", label: "Okno Zbiórki" },
        { key: "data_wymagalnosci", label: "Wymagalność do" }, { key: "saldo", label: "Saldo na Termin" }, { key: "wplata", label: "Wpłata w Oknie" },
        { key: "ocena", label: "Ocena (0-100)", style: ocenaStyle }, { key: "status", label: "Status Zdarzenia", wrap: true },
      ]} rows={osoba.celestia_audyt_glosowan.map((a: any) => ({ ...a, saldo: `${fmt(a.saldo_pln, 2)} zł`, wplata: `${fmt(a.wplata_w_oknie_pln, 2)} zł`, ocena: `${pyFloatStr(a.punkty)} pkt` }))} />
    {:else}
      <Alert kind="info" html="Brak zarejestrowanych terminów głosowań przypadających w trakcie członkostwa tej osoby." />
    {/if}

    {#if osoba.celestia_audyt_kwartalny?.length}
      <h4>📆 Historia Zbiórek Kwartalnych Koła</h4>
      <p class="caption">Ocena terminowości wpłat w wyznaczonych dniach wymagalności kwartalnej (filar Rytmu — bez wpływu na prawa głosu):</p>
      <DataTable testid="audyt-kwartalny" columns={[
        { key: "data", label: "Data Zbiórki" }, { key: "nazwa", label: "Nazwa Zbiórki" }, { key: "okres_zbiorki", label: "Okno Zbiórki" },
        { key: "data_wymagalnosci", label: "Wymagalność do" }, { key: "saldo", label: "Saldo na Termin" }, { key: "wplata", label: "Wpłata w Oknie" },
        { key: "ocena", label: "Ocena (0-100)", style: ocenaStyle }, { key: "status", label: "Status", wrap: true },
      ]} rows={osoba.celestia_audyt_kwartalny.map((a: any) => ({ ...a, saldo: `${fmt(a.saldo_pln, 2)} zł`, wplata: `${fmt(a.wplata_w_oknie_pln, 2)} zł`, ocena: `${pyFloatStr(a.punkty)} pkt` }))} />
    {/if}
  {/if}
{/if}
