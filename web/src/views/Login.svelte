<script lang="ts">
  import { app, THEME_LABELS } from "../lib/state.svelte";
  import { post } from "../lib/api";
  import Alert from "../components/Alert.svelte";
  import Wordmark from "../components/Wordmark.svelte";

  let login = $state("");
  let password = $state("");
  let showPw = $state(false);
  let error = $state("");
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      const r = await post<{ user: any }>("/auth/login", { login, password });
      app.sessionNotice = null;
      app.user = r.user;
    } catch (err: any) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="login-wrap">
  <div class="login-col">
    {#if app.sessionNotice}<Alert kind="warning" html={app.sessionNotice} />{/if}
    <div class="bento-card login-header-card">
      <img class="login-logo" src="/logo.svg" alt="" width="72" height="72" />
      <h2 class="login-wordmark"><Wordmark height={44} /></h2>
      <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 24px;">System Ewidencji Składek i Finansów</div>
    </div>
    <form class="form-card" onsubmit={submit} data-testid="form-login">
      <div class="field">
        <label for="login">Login</label>
        <input id="login" class="input" bind:value={login} autocomplete="username" />
      </div>
      <div class="field">
        <label for="haslo">Hasło</label>
        <div class="pw-wrap">
          <input id="haslo" class="input" type={showPw ? "text" : "password"} bind:value={password} autocomplete="current-password" />
          <button type="button" onclick={() => (showPw = !showPw)} aria-label="Przełącz widoczność hasła">👁</button>
        </div>
      </div>
      <button class="btn full" type="submit" disabled={busy}>Zaloguj do systemu</button>
      {#if error}<div class="mt"><Alert kind="error" html={error} /></div>{/if}
    </form>
    <button class="btn secondary full" type="button" onclick={() => app.cycleTheme()} title="Kliknij, aby przełączyć motyw (Fiolet / Ciemny Mono / Jasny Mono)">
      Motyw: {THEME_LABELS[app.theme]}
    </button>
  </div>
</div>
