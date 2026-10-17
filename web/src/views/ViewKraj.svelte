<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { get } from "../lib/api";
  import { formatKdiValue } from "../../../shared/calculations";
  import { eligibleColor } from "../../../shared/colors";
  import { fmt, plnCard, kdiColor, kdiCellStyle, kdiThresholdStyle, glow } from "../lib/format";
  import { kdiBarFigure } from "../lib/charts";
  import BentoCard from "../components/BentoCard.svelte";
  import Alert from "../components/Alert.svelte";
  import Tabs from "../components/Tabs.svelte";
  import DataTable from "../components/DataTable.svelte";
  import Plot from "../components/Plot.svelte";

  let data = $state<any>(null);
  let error = $state("");
  let tab = $state(0);

  $effect(() => {
    app.version;
    const krajId = app.krajId;
    if (!krajId) return;
    get(`/views/kraj?krajId=${krajId}`).then((d) => (data = d)).catch((e) => (error = e.message));
  });

  const s = $derived(data?.summary);
  const kdiHtml = $derived(s ? formatKdiValue(s.kdiStr, s.progVal, s.progStr) : "");
  const kdiCol = $derived(s ? kdiColor(s.kdiVal, app.isLight) : "");
  const uprCol = $derived(s ? eligibleColor(s.members > 0 ? s.pctEligible : null) : "");
  const columns = $derived([
    { key: "nazwa", label: "Region" },
    { key: "liczbaKol", label: "Liczba Kół", numeric: true },
    { key: "czlonkowie", label: "Członkowie", numeric: true },
    { key: "kasa", label: "Kasa Regionu" },
    { key: "wplaty", label: "Wpłaty" },
    { key: "wydatki", label: "Wydatki" },
    { key: "kdi", label: "KDI Regionu", style: (v: string) => kdiCellStyle(v, app.isLight) },
    { key: "prog", label: "Próg KDI (głos)", style: (v: string) => kdiThresholdStyle(v, app.isLight) },
    { key: "uprawnieni", label: "Uprawnieni" },
  ]);
</script>

{#if error}
  <Alert kind="error" html={error} />
{:else if !data}
  <div class="spinner">Ładowanie…</div>
{:else}
  <h2>🇵🇱 Statystyki Ogólnokrajowe: {data.nazwaKraju}</h2>
  <p class="caption">Zagregowany bilans wszystkich aktywnych regionów i kół podległych jednostce centralnej | Czas biznesowy: <strong>Warszawa</strong></p>

  {#if data.kolaBezRegionu.length}
    <Alert kind="warning" html={`⚠️ <strong>Wykryto ${data.kolaBezRegionu.length} koła bez przypisanego regionu:</strong> ${data.kolaBezRegionu.join(", ")}. Zostały ujęte w wierszu 'Bez regionu' poniżej.`} />
  {/if}

  {#if data.liczbaKol === 0}
    <Alert kind="info" html="Brak aktywnych kół w tym kraju." />
  {:else}
    <div class="cols" data-testid="kraj-cards">
      <div class="col"><BentoCard title="Kasa Całego Kraju" value={plnCard(s.kasaGr)} sub="Wpłaty - Wydatki + Korekty" accent={s.kasaGr >= 0 ? "accent-green" : "accent-rose"} /></div>
      <div class="col"><BentoCard title="Suma Składek (Kraj)" value={plnCard(s.wplatyGr)} sub={`Wydatki: ${plnCard(s.wydatkiGr)}`} accent="accent-cyan" /></div>
      <div class="col"><BentoCard title="Zagregowany KDI Kraju" value={kdiHtml} sub="Rekomendowane: ≤ 1.20" style={glow(kdiCol)} /></div>
      <div class="col"><BentoCard title="Uprawnieni do Głosu (Kraj)" value={`${s.eligible} / ${s.members}`} sub={`${fmt(s.pctEligible, 1)}% (karencja ≤ 6 msc)`} style={glow(uprCol)} /></div>
    </div>

    <h3>🗺️ Zestawienie Regionów w Polsce</h3>
    <Tabs labels={["📋 Tabela Regionów", "📊 Porównanie KDI Regionów"]} bind:active={tab} testid="kraj-tabs" />
    {#if tab === 0}
      <DataTable {columns} rows={data.rows} testid="kraj-table" />
    {:else}
      {@const fig = kdiBarFigure(data.chart, "Wskaźnik KDI Regionu", app.isLight)}
      {#if fig}<Plot figure={fig} />{:else}<p class="caption">Brak danych KDI do wygenerowania wykresu regionów.</p>{/if}
    {/if}
  {/if}
{/if}
