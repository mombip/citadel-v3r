<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post } from "../../lib/api";
  import { fmt, plnCard, plnToGr } from "../../lib/format";
  import BentoCard from "../../components/BentoCard.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Alert from "../../components/Alert.svelte";
  import DataTable from "../../components/DataTable.svelte";

  let { koloId, koloName, sumy, today }: { koloId: number; koloName: string; sumy: any; today: string } = $props();
  const kategorie = ["Integracja", "Materiały biurowe / Druki", "Wydarzenia / Prelekcje", "Sprzęt", "Inne"];
  let wKwota = $state(50.0);
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let wData = $state(today);
  let wKat = $state(kategorie[0]);
  let wOpis = $state("");
  let wErr = $state("");
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let kStan = $state(sumy.kasaGr / 100);
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let kData = $state(today);
  let kPowod = $state("Wyrównanie ze stanem wyciągu bankowego");
  let kErr = $state("");

  async function addExpense(e: Event) {
    e.preventDefault();
    wErr = "";
    try {
      await post(`/kolo/${koloId}/wydatki`, { kwota_gr: plnToGr(wKwota), data_wydatku: wData, kategoria: wKat, opis: wOpis });
      app.toast("success", "Wydatek zaksięgowany.");
      wKwota = 50; wData = today; wKat = kategorie[0]; wOpis = "";
      app.refresh();
    } catch (e: any) { wErr = e.message; }
  }
  async function correctCash(e: Event) {
    e.preventDefault();
    kErr = "";
    try {
      await post(`/kolo/${koloId}/korekty-kasy`, { docelowy_stan_gr: plnToGr(kStan), data_korekty: kData, powod: kPowod });
      app.toast("success", `Stan kasy zaktualizowany na dzień ${kData}.`);
      app.refresh();
    } catch (e: any) { kErr = e.message; }
  }

  let hist = $state<{ wydatki: any[]; korekty: any[] }>({ wydatki: [], korekty: [] });
  $effect(() => {
    app.version;
    get(`/kolo/${koloId}/kasa`).then((h) => (hist = h));
  });
</script>

<h3>💳 Kasa i Płynność: {koloName}</h3>
<div class="cols" data-testid="kasa-cards">
  <div class="col"><BentoCard title="Suma Wpłaconych Pieniędzy" value={plnCard(sumy.wplatyKasaGr)} sub="Wszystkie wpłaty na rachunek tego koła" accent="accent-cyan" /></div>
  <div class="col"><BentoCard title="Suma Wydatków Koła" value={plnCard(sumy.wydatkiGr)} sub="Zarejestrowane koszty operacyjne" accent="accent-rose" /></div>
  <div class="col"><BentoCard title="Pozostałe Środki (Kasa Netto)" value={plnCard(sumy.kasaGr)} sub={`Wpłaty - Wydatki + Korekty (${fmt(sumy.korektyKasyGr / 100, 2, { sign: true, thousands: true })} PLN)`} accent={sumy.kasaGr >= 0 ? "accent-green" : "accent-rose"} /></div>
</div>
<hr />
<div class="cols">
  <div class="col">
    <h4>📤 Zarejestruj Wydatek</h4>
    <form class="form-card" onsubmit={addExpense} data-testid="form-wydatek">
      <NumberInput label="Kwota wydatku (PLN)" bind:value={wKwota} min={0.01} step={1} name="wyd-kwota" />
      <div class="field"><label for="wyd-data">Data poniesienia kosztu</label><input id="wyd-data" class="input" type="date" bind:value={wData} min="2015-01-01" max={today} /></div>
      <Select label="Kategoria" options={kategorie.map((k) => [k, k])} bind:value={wKat} name="wyd-kat" />
      <div class="field"><label for="wyd-opis">Opis wydatku / Nr faktury</label><input id="wyd-opis" class="input" bind:value={wOpis} /></div>
      <button class="btn" type="submit">Zaksięguj wydatek</button>
      {#if wErr}<div class="mt"><Alert kind="error" html={wErr} /></div>{/if}
    </form>
  </div>
  <div class="col">
    <h4>🛠️ Wyrównaj Stan Kasy z Wyciągiem</h4>
    <p class="caption">Ustawia kwotę gotówki w kasie (wyrównanie ze stanem wyciągu bankowego na wskazaną datę).</p>
    <form class="form-card" onsubmit={correctCash} data-testid="form-korekta-kasy">
      <NumberInput label="Docelowy stan kasy (PLN)" bind:value={kStan} step={10} name="kk-stan" />
      <div class="field"><label for="kk-data">Data wyciągu bankowego</label><input id="kk-data" class="input" type="date" bind:value={kData} min="2015-01-01" max={today} /></div>
      <div class="field"><label for="kk-powod">Powód korekty</label><input id="kk-powod" class="input" bind:value={kPowod} /></div>
      <button class="btn" type="submit">Zastosuj korektę kasy</button>
      {#if kErr}<div class="mt"><Alert kind="error" html={kErr} /></div>{/if}
    </form>
  </div>
</div>
<hr />
<div class="cols">
  <div class="col">
    <h4>📋 Ostatnie Wydatki Koła</h4>
    {#if hist.wydatki.length}
      <DataTable testid="wydatki-table" columns={[{ key: "id", label: "ID", numeric: true }, { key: "data_wydatku", label: "Data" }, { key: "kwota", label: "Kwota (PLN)", numeric: true }, { key: "kategoria", label: "Kategoria" }, { key: "opis", label: "Opis / Faktura" }]}
        rows={hist.wydatki.map((w) => ({ ...w, kwota: String(w.kwota_gr / 100) }))} />
    {:else}<p class="caption">Brak zarejestrowanych wydatków.</p>{/if}
  </div>
  <div class="col">
    <h4>⚖️ Historia Ręcznych Korekt Kasy</h4>
    {#if hist.korekty.length}
      <DataTable testid="korekty-kasy-table" columns={[{ key: "id", label: "ID", numeric: true }, { key: "data_korekty", label: "Data" }, { key: "delta", label: "Delta (PLN)", numeric: true }, { key: "stan", label: "Nowy Stan (PLN)", numeric: true }, { key: "powod", label: "Powód" }]}
        rows={hist.korekty.map((k) => ({ ...k, delta: String(k.delta_gr / 100), stan: String(k.docelowy_stan_gr / 100) }))} />
    {:else}<p class="caption">Brak ręcznych korekt stanu kasy.</p>{/if}
  </div>
</div>
