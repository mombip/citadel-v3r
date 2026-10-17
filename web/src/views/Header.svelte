<script lang="ts">
  import { app, THEME_LABELS, type ViewMode } from "../lib/state.svelte";
  import { can, roleLabel } from "../../../shared/rbac";
  import Select from "../components/Select.svelte";
  import Alert from "../components/Alert.svelte";

  const user = $derived(app.user!);
  const dict = $derived(app.dict!);
  const seesCountry = $derived(can(user.rola, "widzi_kraj"));
  const seesRegion = $derived(can(user.rola, "widzi_region"));

  const krajOptions = $derived(dict.kraje.map((k) => [k.id, k.nazwa] as [number, string]));
  const regionOptions = $derived.by(() => {
    const opts = dict.regiony.map((r) => [r.id, r.nazwa] as [number, string]);
    if (dict.kolaBezRegionu > 0 && seesCountry) opts.push([-1, `⚠️ Bez regionu (${dict.kolaBezRegionu})`]);
    return opts;
  });
  const regionNameLocked = $derived.by(() => {
    const hit = dict.regiony.find((r) => r.id === app.regionId);
    if (user.rola === "SKARBNIK_REGIONU") return hit?.nazwa ?? "Twój Region";
    return hit?.nazwa ?? "Region Koła";
  });

  const modes: ViewMode[] = ["🏢 Koło", "📊 Statystyki Regionu", "🇵🇱 Statystyki Kraju"];
  const allowedModes = $derived(seesCountry ? modes : seesRegion ? modes.slice(0, 2) : modes.slice(0, 1));
</script>

<div class="cols header" data-testid="header">
  <div class="col" style="flex: 1.7">
    <h1 style="font-size: 1.6rem; font-weight: 700; margin: 0; padding-top: 1.6rem;">Citadel for NG</h1>
  </div>
  <div class="col" style="flex: 0.8">
    {#if seesCountry}
      <Select label="Kraj" options={krajOptions} bind:value={app.krajId} name="kraj" />
    {:else}
      <Select label="Kraj" options={[[app.krajId, dict.kraje.find((k) => k.id === app.krajId)?.nazwa ?? "Polska"]]} value={app.krajId} disabled name="kraj" />
    {/if}
  </div>
  <div class="col" style="flex: 1.1">
    {#if seesCountry}
      {#if regionOptions.length}
        <Select label="Aktywny Region:" options={regionOptions} bind:value={app.regionId} name="region" />
      {:else}
        <Select label="Aktywny Region:" options={[[0, "Brak regionów w bazie"]]} value={0} name="region" />
      {/if}
    {:else if user.rola === "SKARBNIK_REGIONU"}
      <Select label="Aktywny Region:" options={[[app.regionId ?? 0, regionNameLocked]]} value={app.regionId ?? 0} disabled name="region" />
    {:else}
      <Select label="Region:" options={[[app.regionId ?? 0, regionNameLocked]]} value={app.regionId ?? 0} disabled name="region" />
    {/if}
  </div>
  <div class="col" style="flex: 1.4">
    {#if allowedModes.length > 1}
      <div class="field" role="radiogroup" aria-label="Poziom analityczny:">
        <span class="label">Poziom analityczny:</span>
        <div class="radio-group">
          {#each allowedModes as m}
            <label><input type="radio" name="poziom" value={m} bind:group={app.viewMode} /> <span>{m}</span></label>
          {/each}
        </div>
      </div>
    {:else}
      <div class="caption" style="padding-top: 1.9rem;">🔒 Dostęp do własnego Koła</div>
    {/if}
  </div>
  <div class="col" style="flex: 1.1">
    <div style="font-size: 0.8rem; font-weight: 600; color: #94a3b8;">{user.imie_nazwisko}</div>
    <span class="user-pill" data-testid="user-pill">{roleLabel(user.rola)}</span>
    <div class="cols" style="margin-top: 0.6rem;">
      <div class="col"><button class="btn full" type="button" onclick={() => app.logout()} data-testid="btn-logout">Wyloguj</button></div>
      <div class="col">
        <button class="btn secondary full" type="button" onclick={() => app.cycleTheme()} data-testid="btn-theme" title="Kliknij, aby przełączyć motyw: 💜 Fiolet ➔ 🖤 Ciemny Mono ➔ 🤍 Jasny Mono">
          {THEME_LABELS[app.theme]}
        </button>
      </div>
    </div>
  </div>
</div>

{#if can(user.rola, "akceptuje_wplaty") && dict.pendingCount > 0}
  <Alert kind="warning" html={`🔔 <strong>Kolejka Weryfikacji:</strong> Wpłaty czekające na Twoją akceptację: <strong>${dict.pendingCount}</strong>. Przejdź do widoku <strong>🏢 Koło → 📥 Wpłaty do zaakceptowania</strong>.`} />
{/if}

<style>
  .header { margin-bottom: 1.2rem; }
  .header :global(.field) { margin-bottom: 0; }
</style>
