<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post, del } from "../../lib/api";
  import { ROLES, roleLabel } from "../../../../shared/rbac";
  import { formatTimePL } from "../../lib/format";
  import Tabs from "../../components/Tabs.svelte";
  import Select from "../../components/Select.svelte";
  import DataTable from "../../components/DataTable.svelte";
  import Alert from "../../components/Alert.svelte";
  import Expander from "../../components/Expander.svelte";
  import Checkbox from "../../components/Checkbox.svelte";

  let sub = $state(0);
  const me = $derived(app.user!.id);
  let data = $state<{ users: any[]; kola: any[]; now: string } | null>(null);
  $effect(() => {
    app.version;
    get("/users").then((d) => (data = d));
  });
  const users = $derived(data?.users ?? []);
  const rows = $derived(users.map((u) => {
    const last = u.ostatnia_aktywnosc ? Date.parse(u.ostatnia_aktywnosc) : NaN;
    const now = data ? Date.parse(data.now) : Date.now();
    const online = !isNaN(last) && now - last >= 0 && now - last <= 300_000;
    return {
      id: u.id, login: u.login, imie: u.imie_nazwisko, rola: roleLabel(u.rola),
      jednostka: u.rola === "SKARBNIK_KOLA" ? `Koło: ${u.kolo_nazwa ?? "Brak"}` : u.rola === "SKARBNIK_REGIONU" ? `Region: ${u.region_nazwa ?? "Brak"}` : "Centrala (Kraj)",
      status: u.is_active ? "🟢 AKTYWNY" : "🔴 ZABLOKOWANY", sesja: online ? "🟢 Online" : "⚪ Offline",
      logowanie: formatTimePL(u.ostatnie_logowanie), aktywnosc: formatTimePL(u.ostatnia_aktywnosc),
    };
  }));
  const others = $derived(users.filter((u) => u.id !== me));
  const roleOptions = ROLES.map((r) => [r, r] as [string, string]);

  let blokId = $state<number | null>(null);
  const blokUser = $derived(users.find((u) => u.id === blokId));
  let rolaId = $state<number | null>(null);
  let nowaRola = $state("SKARBNIK_KOLA");
  let resetId = $state<number | null>(null);
  let resetHaslo = $state("Citadel2026!");
  let resetErr = $state("");
  let usunId = $state<number | null>(null);
  const usunUser = $derived(users.find((u) => u.id === usunId));
  let usunOk = $state(false);

  const act = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); app.toast("success", msg); app.refresh(); } catch (e: any) { app.toast("error", e.message); }
  };

  // New account
  let nLogin = $state("");
  let nImie = $state("");
  let nHaslo = $state("Citadel2026!");
  let nRola = $state("SKARBNIK_KOLA");
  let nKolo = $state<number | null>(null);
  let nReg = $state<number | null>(null);
  let nErr = $state("");
  const kolaOptions = $derived<[number, string][]>((data?.kola ?? []).map((k: any) => [k.id, k.nazwa]));
  const regOptions = $derived<[number, string][]>((app.dict?.regiony ?? []).map((r) => [r.id, r.nazwa]));
  async function createUser() {
    nErr = "";
    if (!nLogin.trim() || !nImie.trim()) return void (nErr = "Wypełnij wymagane pola.");
    try {
      await post("/users", { login: nLogin.trim(), imie_nazwisko: nImie.trim(), haslo: nHaslo, rola: nRola, kraj_id: app.krajId, region_id: nRola === "SKARBNIK_REGIONU" ? nReg : null, kolo_id: nRola === "SKARBNIK_KOLA" ? nKolo : null });
      app.toast("success", `Utworzono konto: ${nLogin.trim()}!`);
      nLogin = ""; nImie = "";
      app.refresh();
    } catch (e: any) { nErr = e.message; }
  }
</script>

<h3>🏛️ Panel Centauri — Zarządzanie Kontami i Uprawnieniami</h3>
<p class="caption">Centrum kontroli dostępu, zarządzanie sesjami w czasie rzeczywistym i nadzór nad kontami.</p>
<Tabs labels={["👥 Rejestr Użytkowników & Akcje", "➕ Nowe Konto"]} bind:active={sub} testid="centauri-tabs" />

{#if !data}
  <div class="spinner">Ładowanie…</div>
{:else if sub === 0}
  <DataTable testid="users-table" columns={[
    { key: "id", label: "ID", numeric: true }, { key: "login", label: "Login" }, { key: "imie", label: "Imię i Nazwisko" }, { key: "rola", label: "Rola" }, { key: "jednostka", label: "Jednostka" },
    { key: "status", label: "Status Konta" }, { key: "sesja", label: "Sesja" }, { key: "logowanie", label: "Ostatnie logowanie" }, { key: "aktywnosc", label: "Ostatnia aktywność" },
  ]} {rows} />
  <hr />
  <div class="cols">
    <div class="col">
      <h4>🔒 Blokada Dostępu</h4>
      {#if others.length}
        <Select label="Wybierz konto:" options={others.map((u) => [u.id, `${u.login} (${u.is_active ? "Aktywny" : "ZABLOKOWANY"})`] as [number, string])} bind:value={blokId} name="u-blok" />
        <button class="btn full" type="button" onclick={() => act(() => post(`/users/${blokId}/toggle-active`), `Zaktualizowano status konta: ${blokUser?.login}.`)}>{blokUser?.is_active ? "🔴 Zablokuj dostęp" : "🟢 Odblokuj dostęp"}</button>
      {:else}<p class="caption">Brak innych kont.</p>{/if}
    </div>
    <div class="col">
      <h4>🔄 Zmiana Roli</h4>
      {#if others.length}
        <Select label="Wybierz konto:" options={others.map((u) => [u.id, `${u.login} (${u.imie_nazwisko})`] as [number, string])} bind:value={rolaId} name="u-rola" />
        <Select label="Nowa rola:" options={roleOptions} bind:value={nowaRola} name="u-nowa-rola" />
        <button class="btn full" type="button" onclick={() => act(() => post(`/users/${rolaId}/role`, { rola: nowaRola }), "Uprawnienia zostały zaktualizowane.")}>Zastosuj nową rolę</button>
      {:else}<p class="caption">Brak innych kont.</p>{/if}
    </div>
    <div class="col">
      <h4>🔑 Reset Hasła</h4>
      <Select label="Konto do resetu:" options={users.map((u) => [u.id, u.login] as [number, string])} bind:value={resetId} name="u-reset" />
      <div class="field"><label for="u-reset-pw">Nowe hasło:</label><input id="u-reset-pw" class="input" bind:value={resetHaslo} /></div>
      <button class="btn full" type="button" onclick={() => { resetErr = ""; if (resetHaslo.length < 6) return void (resetErr = "Min. 6 znaków!"); act(() => post(`/users/${resetId}/reset-password`, { haslo: resetHaslo }), "Hasło zaktualizowane. Aktywna sesja wygasła."); }}>Ustaw i wymuś zmianę</button>
      {#if resetErr}<div class="mt"><Alert kind="error" html={resetErr} /></div>{/if}
    </div>
    <div class="col">
      <h4>🗑️ Usuń Konto</h4>
      {#if others.length}
        <Select label="Konto do usunięcia:" options={others.map((u) => [u.id, `${u.login} (${u.imie_nazwisko})`] as [number, string])} bind:value={usunId} name="u-usun" />
        <Expander title="⚠️ Potwierdzenie">
          <Checkbox label={`Usuń ${usunUser?.login ?? ""}`} bind:checked={usunOk} name="u-usun-ok" />
          <button class="btn full" type="button" onclick={() => { if (!usunOk) return app.toast("warning", "Potwierdź checkboxem."); act(() => del(`/users/${usunId}`).then(() => (usunOk = false)), `Konto ${usunUser?.login} zostało usunięte.`); }}>🔥 Skasuj trwale</button>
        </Expander>
      {:else}<p class="caption">Brak innych użytkowników.</p>{/if}
    </div>
  </div>
{:else}
  <div class="max-600">
    <h4>👤 Tworzenie Nowego Konta</h4>
    <div class="field"><label for="n-login">Login (np. skarbnik_lodz)</label><input id="n-login" class="input" bind:value={nLogin} /></div>
    <div class="field"><label for="n-imie">Imię i Nazwisko użytkownika</label><input id="n-imie" class="input" bind:value={nImie} /></div>
    <div class="field"><label for="n-haslo">Hasło startowe</label><input id="n-haslo" class="input" bind:value={nHaslo} /></div>
    <Select label="Rola w organizacji:" options={roleOptions} bind:value={nRola} name="n-rola" />
    {#if nRola === "SKARBNIK_KOLA" && kolaOptions.length}
      <Select label="Przypisz Koło:" options={kolaOptions} bind:value={nKolo} name="n-kolo" />
    {:else if nRola === "SKARBNIK_REGIONU" && regOptions.length}
      <Select label="Przypisz Region:" options={regOptions} bind:value={nReg} name="n-reg" />
    {/if}
    <button class="btn full" type="button" onclick={createUser} data-testid="btn-utworz-konto">➕ Utwórz konto w Citadel</button>
    {#if nErr}<div class="mt"><Alert kind="error" html={nErr} /></div>{/if}
  </div>
{/if}
