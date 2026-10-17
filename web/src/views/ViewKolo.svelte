<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { get } from "../lib/api";
  import { can, roleLabel } from "../../../shared/rbac";
  import { dynamicKdiThreshold, formatKdiValue, kdiOf } from "../../../shared/calculations";
  import { eligibleColor } from "../../../shared/colors";
  import { fmt, plnCard, kdiColor, glow } from "../lib/format";
  import BentoCard from "../components/BentoCard.svelte";
  import Alert from "../components/Alert.svelte";
  import Tabs from "../components/Tabs.svelte";
  import Select from "../components/Select.svelte";
  import TabZbiorcza from "./kolo/TabZbiorcza.svelte";
  import TabProfile from "./kolo/TabProfile.svelte";
  import TabCelestia from "./kolo/TabCelestia.svelte";
  import TabWplaty from "./kolo/TabWplaty.svelte";
  import TabReczne from "./kolo/TabReczne.svelte";
  import TabKasa from "./kolo/TabKasa.svelte";
  import TabKorekty from "./kolo/TabKorekty.svelte";
  import TabCzlonkowie from "./kolo/TabCzlonkowie.svelte";
  import TabKalkulator from "./kolo/TabKalkulator.svelte";
  import TabAkceptacje from "./kolo/TabAkceptacje.svelte";
  import TabStruktura from "./kolo/TabStruktura.svelte";
  import TabAudyt from "./kolo/TabAudyt.svelte";
  import TabCentauri from "./kolo/TabCentauri.svelte";

  const user = $derived(app.user!);
  const role = $derived(user.rola);
  let kola = $state<{ id: number; nazwa: string }[]>([]);
  let overview = $state<any>(null);
  let error = $state("");
  let listError = $state("");
  let tab = $state(0);

  const regionName = $derived.by(() => {
    if (app.regionId === -1) return "Nieprzypisane do regionu";
    return app.dict?.regiony.find((r) => r.id === app.regionId)?.nazwa ?? (role === "SKARBNIK_KOLA" ? "Region Koła" : "Brak aktywnych regionów");
  });

  // Units available for the selector depend on the role and the selected region.
  $effect(() => {
    app.version;
    const krajId = app.krajId;
    const regionId = app.regionId;
    if (!krajId) return;
    const q = role === "ADMIN" || role === "SKARBNIK_KRAJOWY" ? `&regionId=${regionId ?? ""}` : "";
    get(`/kola?krajId=${krajId}${q}`)
      .then((list) => {
        kola = list;
        if (!list.some((k: any) => k.id === app.koloId)) app.koloId = list[0]?.id ?? null;
        listError = "";
      })
      .catch((e) => (listError = e.message));
  });

  $effect(() => {
    app.version;
    const id = app.koloId;
    if (!id) {
      overview = null;
      return;
    }
    get(`/kolo/${id}`).then((d) => { overview = d; error = ""; }).catch((e) => (error = e.message));
  });

  const koloOptions = $derived(kola.map((k) => [k.id, k.nazwa] as [number, string]));
  const kolo = $derived(overview?.kolo);
  const members = $derived<any[]>(overview?.members ?? []);
  const sumy = $derived(overview?.sumy);
  const kdiVal = $derived(sumy ? kdiOf(sumy.totalZGr, sumy.totalSGr) : null);
  const kdiStr = $derived(kdiVal !== null ? fmt(kdiVal, 2) : "Brak danych");
  const prog = $derived(dynamicKdiThreshold(members));
  const kdiHtml = $derived(formatKdiValue(kdiStr, prog[0], prog[1]));
  const kdiCol = $derived(kdiColor(kdiVal, app.isLight));
  const eligible = $derived(members.filter((m) => m.moze_glosowac).length);
  const pct = $derived(members.length ? (eligible / members.length) * 100 : 0);
  const uprCol = $derived(eligibleColor(members.length ? pct : null));

  const tabLabels = $derived.by(() => {
    const t = ["📊 Tabela Zbiorcza", "📈 Profile & Wykresy", "⭐ Celestia & Głosowania", "💰 Wpłaty Członków"];
    if (can(role, "reczne_naliczenia")) t.push("📝 Ręczne Naliczenia");
    t.push("💳 Kasa Koła & Wydatki");
    if (can(role, "korekty_salda")) t.push("🛠️ Korekta Salda Osoby");
    t.push("👤 Zarządzaj Członkami", "🧮 Kalkulator");
    if (can(role, "akceptuje_wplaty")) t.push(`📥 Wpłaty do zaakceptowania${overview?.pendingCount > 0 ? ` (${overview.pendingCount})` : ""}`);
    if (can(role, "zarzadza_struktura")) t.push("🏛️ Zarządzaj Strukturą");
    if (can(role, "widzi_audyt")) t.push("📜 Logi Audytowe");
    if (can(role, "zarzadza_kontami")) t.push("🏛️ Panel Centauri");
    return t;
  });
  const activeLabel = $derived(tabLabels[tab] ?? tabLabels[0]);
  const is = (prefix: string) => activeLabel.startsWith(prefix);
</script>

{#if listError}
  <Alert kind="error" html={listError} />
{:else if !kola.length}
  <Alert kind="warning" html="Brak dostępnych aktywnych kół w tym widoku." />
{:else}
  <div class="cols">
    <div class="col" style="flex: 2">
      {#if role === "SKARBNIK_KOLA"}
        <Select label="Koło:" options={koloOptions} value={app.koloId} disabled name="kolo" />
      {:else}
        <Select label={`Wybierz Koło z regionu: ${regionName}`} options={koloOptions} bind:value={app.koloId} name="kolo" />
      {/if}
    </div>
    <div class="col" style="flex: 2"></div>
  </div>

  {#if error}
    <Alert kind="error" html={error} />
  {:else if !overview}
    <div class="spinner">Ładowanie…</div>
  {:else}
    <p class="caption">Aktywna jednostka: <strong>{kolo.nazwa}</strong> | Rola: <strong>{roleLabel(role)}</strong> | Czas: <strong>Europe/Warsaw</strong></p>

    <div class="cols" data-testid="kolo-cards">
      <div class="col"><BentoCard title="Faktyczna Kasa Koła" value={plnCard(sumy.kasaGr)} sub="Wpłaty - Wydatki + Korekty" accent={sumy.kasaGr >= 0 ? "accent-green" : "accent-rose"} /></div>
      <div class="col"><BentoCard title="Suma Wpłaconych Składek" value={plnCard(sumy.wplatyKasaGr)} sub="Wpłacone do kasy tego koła" accent="accent-cyan" /></div>
      <div class="col"><BentoCard title={`KDI Koła (${kolo.nazwa})`} value={kdiHtml} sub="Rekomendowane: ≤ 1.20" style={glow(kdiCol)} /></div>
      <div class="col"><BentoCard title="Uprawnieni do Głosowania" value={`${eligible} / ${members.length}`} sub={`${fmt(pct, 1)}% (karencja ≤ 6 msc)`} style={glow(uprCol)} /></div>
    </div>

    <Tabs labels={tabLabels} bind:active={tab} testid="kolo-tabs" />

    {#if is("📊 Tabela Zbiorcza")}
      <TabZbiorcza {members} koloName={kolo.nazwa} />
    {:else if is("📈 Profile")}
      <TabProfile {members} koloId={kolo.id} today={overview.today} />
    {:else if is("⭐ Celestia")}
      <TabCelestia {members} koloId={kolo.id} today={overview.today} />
    {:else if is("💰 Wpłaty")}
      <TabWplaty {members} koloId={kolo.id} today={overview.today} />
    {:else if is("📝 Ręczne")}
      <TabReczne {members} koloId={kolo.id} today={overview.today} />
    {:else if is("💳 Kasa")}
      <TabKasa koloId={kolo.id} koloName={kolo.nazwa} {sumy} today={overview.today} />
    {:else if is("🛠️ Korekta")}
      <TabKorekty {members} koloId={kolo.id} today={overview.today} />
    {:else if is("👤 Zarządzaj")}
      <TabCzlonkowie {members} koloId={kolo.id} today={overview.today} />
    {:else if is("🧮 Kalkulator")}
      <TabKalkulator today={overview.today} />
    {:else if is("📥 Wpłaty do zaakceptowania")}
      <TabAkceptacje />
    {:else if is("🏛️ Zarządzaj Strukturą")}
      <TabStruktura />
    {:else if is("📜 Logi")}
      <TabAudyt koloId={kolo.id} />
    {:else if is("🏛️ Panel Centauri")}
      <TabCentauri />
    {/if}
  {/if}
{/if}
