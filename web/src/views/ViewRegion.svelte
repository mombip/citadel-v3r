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

  const regionName = $derived.by(() => {
    if (app.regionId === -1) return "Nieprzypisane do regionu";
    if (app.regionId === null) return "Brak aktywnych regionów";
    return app.dict?.regiony.find((r) => r.id === app.regionId)?.nazwa ?? "Nieznany region";
  });
  const krajName = $derived(app.dict?.kraje.find((k) => k.id === app.krajId)?.nazwa ?? "Polska");

  $effect(() => {
    app.version;
    const krajId = app.krajId;
    const regionId = app.regionId;
    if (!krajId || regionId === null) return;
    data = null;
    get(`/views/region?krajId=${krajId}&regionId=${regionId}`).then((d) => (data = d)).catch((e) => (error = e.message));
  });

  const s = $derived(data?.summary);
  const kdiHtml = $derived(s ? formatKdiValue(s.kdiStr, s.progVal, s.progStr) : "");
  const kdiCol = $derived(s ? kdiColor(s.kdiVal, app.isLight) : "");
  const uprCol = $derived(s ? eligibleColor(s.members > 0 ? s.pctEligible : null) : "");
  const columns = $derived([
    { key: "id", label: "ID", numeric: true },
    { key: "nazwa", label: "Koło" },
    { key: "czlonkowie", label: "Liczba Członków", numeric: true },
    { key: "kasa", label: "Kasa Koła" },
    { key: "wplaty", label: "Wpłacone Składki" },
    { key: "wydatki", label: "Wydatki" },
    { key: "kdi", label: "KDI Koła", style: (v: string) => kdiCellStyle(v, app.isLight) },
    { key: "prog", label: "Próg KDI (głos)", style: (v: string) => kdiThresholdStyle(v, app.isLight) },
    { key: "uprawnieni", label: "Uprawnieni" },
  ]);
</script>

<h2>📊 Pulpit Analityczny: {regionName}</h2>
<p class="caption">Kraj: <strong>{krajName}</strong> | Strefa biznesowa: <strong>Warszawa</strong></p>

{#if error}
  <Alert kind="error" html={error} />
{:else if app.regionId === null}
  <Alert kind="info" html={`Region '${regionName}' nie posiada aktualnie przypisanych aktywnych kół.`} />
{:else if !data}
  <div class="spinner">Ładowanie…</div>
{:else if data.liczbaKol === 0}
  <Alert kind="info" html={`Region '${regionName}' nie posiada aktualnie przypisanych aktywnych kół.`} />
{:else}
  <div class="cols" data-testid="region-cards">
    <div class="col"><BentoCard title="Kasa Całego Regionu" value={plnCard(s.kasaGr)} sub="Zagregowane środki płynne" accent={s.kasaGr >= 0 ? "accent-green" : "accent-rose"} /></div>
    <div class="col"><BentoCard title="Suma Składek Regionu" value={plnCard(s.wplatyGr)} sub={`Wydatki: ${plnCard(s.wydatkiGr)}`} accent="accent-cyan" /></div>
    <div class="col"><BentoCard title="Zagregowany KDI Regionu" value={kdiHtml} sub="Rekomendowane: ≤ 1.20" style={glow(kdiCol)} /></div>
    <div class="col"><BentoCard title="Uprawnieni do Głosu (Region)" value={`${s.eligible} / ${s.members}`} sub={`${fmt(s.pctEligible, 1)}% (karencja ≤ 6 msc)`} style={glow(uprCol)} /></div>
  </div>

  <h3>🏛️ Koła podległe pod {regionName}</h3>
  <Tabs labels={["📋 Tabela Kół", "📊 Porównanie KDI Kół"]} bind:active={tab} testid="region-tabs" />
  {#if tab === 0}
    <DataTable {columns} rows={data.rows} testid="region-table" />
  {:else}
    {@const fig = kdiBarFigure(data.chart, "Wskaźnik KDI Koła", app.isLight)}
    {#if fig}<Plot figure={fig} />{:else}<p class="caption">Brak danych KDI do wygenerowania wykresu kół.</p>{/if}
  {/if}
{/if}
