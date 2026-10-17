<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post, put, del } from "../../lib/api";
  import { can } from "../../../../shared/rbac";
  import { formatTimePL } from "../../lib/format";
  import Tabs from "../../components/Tabs.svelte";
  import Select from "../../components/Select.svelte";
  import Checkbox from "../../components/Checkbox.svelte";
  import Alert from "../../components/Alert.svelte";
  import Expander from "../../components/Expander.svelte";

  const role = $derived(app.user!.rola);
  const krajId = $derived(app.krajId!);
  let sub = $state(0);
  let koszSub = $state(0);
  let s = $state<any>(null);
  $effect(() => {
    app.version;
    get(`/structure?krajId=${krajId}`).then((d) => (s = d));
  });
  const regOptions = $derived<[number, string][]>((s?.regiony ?? []).map((r: any) => [r.id, r.nazwa]));
  const regChoice = $derived<[number | null, string][]>([[null, "⚠️ Bez przypisanego regionu"], ...regOptions]);
  const kolaOptions = $derived<[number, string][]>((s?.kola ?? []).map((k: any) => [k.id, `${k.nazwa} (${k.region_nazwa ?? "Bez regionu"})`]));
  const kolCount = (rid: number) => Number((s?.regionyLiczbaKol ?? []).find((x: any) => x.region_id === rid)?.n ?? 0);
  const defaultReg = $derived(app.regionId && app.regionId !== -1 && regOptions.some(([id]) => id === app.regionId) ? app.regionId : null);

  const run = async (fn: () => Promise<any>, okMsg: string, setErr: (m: string) => void) => {
    setErr("");
    try { await fn(); app.toast("success", okMsg); app.refresh(); } catch (e: any) { setErr(e.message); }
  };

  // Regions
  let nowyReg = $state("");
  let errNowyReg = $state("");
  let edRegId = $state<number | null>(null);
  let edRegNazwa = $state("");
  let errEdReg = $state("");
  $effect(() => { if (edRegId === null && defaultReg) edRegId = defaultReg; });
  $effect(() => { const hit = regOptions.find(([id]) => id === edRegId); if (hit) edRegNazwa = hit[1]; });
  let delRegId = $state<number | null>(null);
  let delRegOk = $state(false);
  let errDelReg = $state("");
  const delRegName = $derived(regOptions.find(([id]) => id === delRegId)?.[1] ?? "");

  // Units
  let noweKolo = $state("");
  let noweKoloReg = $state<number | null>(null);
  let errNoweKolo = $state("");
  $effect(() => { noweKoloReg = defaultReg; });
  let edKoloId = $state<number | null>(null);
  const edKolo = $derived((s?.kola ?? []).find((k: any) => k.id === edKoloId));
  let edKoloNazwa = $state("");
  let edKoloReg = $state<number | null>(null);
  let errEdKolo = $state("");
  $effect(() => { if (edKolo) { edKoloNazwa = edKolo.nazwa; edKoloReg = regOptions.some(([id]) => id === edKolo.region_id) ? edKolo.region_id : null; } });
  let delKoloId = $state<number | null>(null);
  const delKolo = $derived((s?.kola ?? []).find((k: any) => k.id === delKoloId));
  let delKoloOk = $state(false);
  let errDelKolo = $state("");

  // Trash
  let permK = $state<Record<number, boolean>>({});
  let permR = $state<Record<number, boolean>>({});
  let errTrash = $state("");
</script>

<h3>🏛️ Zarządzanie Architekturą Organizacji</h3>
<p class="caption">Pełne zarządzanie strukturą: tworzenie, edycja nazw i przypisań, archiwizacja (kosz) oraz trwałe usuwanie.</p>
<Tabs labels={["🌍 Regiony", "🏢 Koła", "♻️ Kosz i Przywracanie"]} bind:active={sub} testid="struktura-tabs" />

{#if !s}
  <div class="spinner">Ładowanie…</div>
{:else if sub === 0}
  <div class="cols">
    <div class="col">
      <h4>➕ Nowy Region</h4>
      <form class="form-card" data-testid="form-nowy-region" onsubmit={(e) => { e.preventDefault(); if (!nowyReg.trim()) return void (errNowyReg = "Nazwa regionu nie może być pusta."); run(() => post("/regiony", { kraj_id: krajId, nazwa: nowyReg.trim() }).then(() => (nowyReg = "")), `Region '${nowyReg.trim()}' został utworzony.`, (m) => (errNowyReg = m)); }}>
        <div class="field"><label for="reg-nowy">Nazwa nowego regionu:</label><input id="reg-nowy" class="input" bind:value={nowyReg} /></div>
        <button class="btn full" type="submit">➕ Utwórz Region</button>
        {#if errNowyReg}<div class="mt"><Alert kind="error" html={errNowyReg} /></div>{/if}
      </form>
    </div>
    <div class="col">
      <h4>✏️ Zmień Nazwę Regionu</h4>
      {#if !regOptions.length}
        <p class="caption">Brak aktywnych regionów do edycji.</p>
      {:else}
        <Select label="Wybierz region do zmiany nazwy:" options={regOptions} bind:value={edRegId} name="reg-ed" />
        <form class="form-card" data-testid="form-edytuj-region" onsubmit={(e) => { e.preventDefault(); if (!edRegNazwa.trim()) return void (errEdReg = "Nazwa regionu nie może być pusta."); run(() => put(`/regiony/${edRegId}`, { nazwa: edRegNazwa.trim() }), "Nazwa regionu została zaktualizowana.", (m) => (errEdReg = m)); }}>
          <div class="field"><label for="reg-ed-nazwa">Nowa nazwa regionu:</label><input id="reg-ed-nazwa" class="input" bind:value={edRegNazwa} /></div>
          <button class="btn full" type="submit">💾 Zapisz nową nazwę</button>
          {#if errEdReg}<div class="mt"><Alert kind="error" html={errEdReg} /></div>{/if}
        </form>
      {/if}
    </div>
  </div>
  <hr />
  <h4>🗑️ Przenieś Region do Kosza</h4>
  {#if !regOptions.length}
    <Alert kind="info" html="Brak aktywnych regionów." />
  {:else}
    <div class="cols">
      <div class="col" style="flex: 1.2">
        <Select label="Wybierz region do przeniesienia do kosza:" options={regOptions} bind:value={delRegId} name="reg-del" />
        {#if delRegId !== null}<Alert kind="warning" html={`⚠️ <strong>Uwaga:</strong> Region '${delRegName}' posiada <strong>${kolCount(delRegId)}</strong> aktywnych kół. Przeniesienie regionu do kosza spowoduje automatyczne ukrycie wszystkich jego kół.`} />{/if}
      </div>
      <div class="col" style="flex: 1; padding-top: 1.6rem;">
        <Checkbox label={`Potwierdzam przeniesienie do kosza regionu: ${delRegName}`} bind:checked={delRegOk} name="reg-del-ok" />
        <button class="btn full" type="button" data-testid="btn-region-kosz" onclick={() => { if (!delRegOk) return void (errDelReg = "Zaznacz checkbox, aby potwierdzić operację."); run(() => post(`/regiony/${delRegId}/trash`).then(() => (delRegOk = false)), `Region '${delRegName}' został przeniesiony do kosza.`, (m) => (errDelReg = m)); }}>🗑️ Przenieś region do kosza</button>
        {#if errDelReg}<div class="mt"><Alert kind="error" html={errDelReg} /></div>{/if}
      </div>
    </div>
  {/if}
{:else if sub === 1}
  <div class="cols">
    <div class="col">
      <h4>➕ Nowe Koło</h4>
      <form class="form-card" data-testid="form-nowe-kolo" onsubmit={(e) => { e.preventDefault(); if (!noweKolo.trim()) return void (errNoweKolo = "Nazwa koła jest wymagana."); run(() => post("/kola", { kraj_id: krajId, nazwa: noweKolo.trim(), region_id: noweKoloReg }).then(() => (noweKolo = "")), `Koło '${noweKolo.trim()}' zostało utworzone.`, (m) => (errNoweKolo = m)); }}>
        <div class="field"><label for="kolo-nowe">Nazwa nowego koła:</label><input id="kolo-nowe" class="input" bind:value={noweKolo} /></div>
        <Select label="Przypisz do regionu:" options={regChoice} bind:value={noweKoloReg} name="kolo-nowe-reg" />
        <button class="btn full" type="submit">➕ Utwórz Koło</button>
        {#if errNoweKolo}<div class="mt"><Alert kind="error" html={errNoweKolo} /></div>{/if}
      </form>
    </div>
    <div class="col">
      <h4>✏️ Edytuj Koło (Nazwa i Region)</h4>
      {#if !kolaOptions.length}
        <p class="caption">Brak aktywnych kół w tym kraju.</p>
      {:else}
        <Select label="Wybierz koło do edycji:" options={kolaOptions} bind:value={edKoloId} name="kolo-ed" />
        {#if edKolo}
          <form class="form-card" data-testid="form-edytuj-kolo" onsubmit={(e) => { e.preventDefault(); if (!edKoloNazwa.trim()) return void (errEdKolo = "Nazwa koła nie może być pusta."); run(() => put(`/kola/${edKoloId}`, { nazwa: edKoloNazwa.trim(), region_id: edKoloReg }), `Zaktualizowano koło '${edKoloNazwa.trim()}'.`, (m) => (errEdKolo = m)); }}>
            <div class="field"><label for="kolo-ed-nazwa">Nazwa koła:</label><input id="kolo-ed-nazwa" class="input" bind:value={edKoloNazwa} /></div>
            <Select label="Region nadrzędny:" options={regChoice} bind:value={edKoloReg} name="kolo-ed-reg" />
            <button class="btn full" type="submit">💾 Zapisz zmiany w kole</button>
            {#if errEdKolo}<div class="mt"><Alert kind="error" html={errEdKolo} /></div>{/if}
          </form>
        {/if}
      {/if}
    </div>
  </div>
  <hr />
  <h4>🗑️ Przenieś Koło do Kosza</h4>
  {#if !kolaOptions.length}
    <Alert kind="info" html="Brak kół do archiwizacji." />
  {:else}
    <div class="cols">
      <div class="col" style="flex: 1.2">
        <Select label="Wybierz koło do przeniesienia do kosza:" options={kolaOptions} bind:value={delKoloId} name="kolo-del" />
        {#if delKolo}<Alert kind="warning" html={`⚠️ Koło '${delKolo.nazwa}' liczy <strong>${delKolo.liczba_czlonkow}</strong> członków. Przeniesienie do kosza ukryje to koło z list wyboru i widoków publicznych.`} />{/if}
      </div>
      <div class="col" style="flex: 1; padding-top: 1.6rem;">
        <Checkbox label={`Potwierdzam przeniesienie do kosza: ${delKolo?.nazwa ?? ""}`} bind:checked={delKoloOk} name="kolo-del-ok" />
        <button class="btn full" type="button" data-testid="btn-kolo-kosz" onclick={() => { if (!delKoloOk) return void (errDelKolo = "Zaznacz checkbox, aby potwierdzić."); run(() => post(`/kola/${delKoloId}/trash`).then(() => (delKoloOk = false)), `Koło '${delKolo?.nazwa}' zostało przeniesione do kosza.`, (m) => (errDelKolo = m)); }}>🗑️ Przenieś koło do kosza</button>
        {#if errDelKolo}<div class="mt"><Alert kind="error" html={errDelKolo} /></div>{/if}
      </div>
    </div>
  {/if}
{:else}
  <h4>♻️ Elementy w Koszu (Archiwum)</h4>
  <p class="caption">Elementy przeniesione do kosza są niewidoczne w systemie operacyjnym. Możesz je w każdej chwili przywrócić lub trwale usunąć.</p>
  <Tabs labels={["🏢 Koła w Koszu", "🌍 Regiony w Koszu"]} bind:active={koszSub} testid="kosz-tabs" />
  {#if errTrash}<Alert kind="error" html={errTrash} />{/if}
  {#if koszSub === 0}
    {#if !s.kolaKosz.length}
      <Alert kind="success" html="🎉 Kosz kół jest pusty." />
    {:else}
      {#each s.kolaKosz as k (k.id)}
        <div data-testid="kosz-kolo">
          <p><strong>🏢 {k.nazwa}</strong> | Region: <strong>{k.region_nazwa ?? "Bez regionu"}</strong> | Usunięto: <code>{formatTimePL(k.deleted_at)}</code></p>
          {#if k.region_w_koszu}<Alert kind="warning" html={`⚠️ Region nadrzędny ('${k.region_nazwa}') znajduje się w koszu. Aby przywrócić to koło, musisz najpierw przywrócić jego region.`} />{/if}
          <div class="cols">
            <div class="col"><button class="btn" type="button" onclick={() => run(() => post(`/kola/${k.id}/restore`), `Koło '${k.nazwa}' zostało przywrócone.`, (m) => (errTrash = m))}>🟢 Przywróć koło: {k.nazwa}</button></div>
            <div class="col" style="flex: 1.2">
              {#if can(role, "zarzadza_koszem")}
                <Expander title={`🔥 Trwałe usunięcie (${k.nazwa})`}>
                  <Alert kind="error" html="⚠️ Ta operacja jest NIEODWRACALNA! Usunie wszystkie wpłaty, wydatki i historię członków tego koła." />
                  <Checkbox label={`Trwale usuń dane koła ${k.nazwa}`} checked={permK[k.id] ?? false} name={`perm-k-${k.id}`} />
                  <label class="checkbox" style="display:none"><input type="checkbox" bind:checked={permK[k.id]} /></label>
                  <button class="btn" type="button" onclick={() => { if (!permK[k.id]) return void (errTrash = "Musisz zaznaczyć checkbox potwierdzający."); run(() => del(`/kola/${k.id}`), `Koło '${k.nazwa}' zostało trwale usunięte z bazy.`, (m) => (errTrash = m)); }}>🔥 Usuń trwale z bazy #{k.id}</button>
                </Expander>
              {/if}
            </div>
          </div>
          <hr />
        </div>
      {/each}
    {/if}
  {:else if !s.regionyKosz.length}
    <Alert kind="success" html="🎉 Kosz regionów jest pusty." />
  {:else}
    {#each s.regionyKosz as r (r.id)}
      <div data-testid="kosz-region">
        <p><strong>🌍 {r.nazwa}</strong> | Podległe koła w archiwum: <strong>{r.powiazane_kola}</strong> | Usunięto: <code>{formatTimePL(r.deleted_at)}</code></p>
        <div class="cols">
          <div class="col"><button class="btn" type="button" onclick={() => run(() => post(`/regiony/${r.id}/restore`), `Region '${r.nazwa}' oraz jego koła zostały pomyślnie przywrócone.`, (m) => (errTrash = m))}>🟢 Przywróć region: {r.nazwa}</button></div>
          <div class="col" style="flex: 1.2">
            {#if can(role, "zarzadza_koszem")}
              <Expander title={`🔥 Trwałe usunięcie (${r.nazwa})`}>
                <Alert kind="error" html={`⚠️ Trwałe usunięcie regionu skasuje również ${r.powiazane_kola} powiązanych kół i ich całą historię finansową!`} />
                <label class="checkbox"><input type="checkbox" bind:checked={permR[r.id]} /> <span>Trwale usuń region {r.nazwa}</span></label>
                <button class="btn" type="button" onclick={() => { if (!permR[r.id]) return void (errTrash = "Musisz zaznaczyć checkbox potwierdzający."); run(() => del(`/regiony/${r.id}`), `Region '${r.nazwa}' został trwale usunięty z bazy.`, (m) => (errTrash = m)); }}>🔥 Usuń trwale z bazy #{r.id}</button>
              </Expander>
            {/if}
          </div>
        </div>
        <hr />
      </div>
    {/each}
  {/if}
{/if}
