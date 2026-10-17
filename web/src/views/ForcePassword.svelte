<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { post } from "../lib/api";
  import Alert from "../components/Alert.svelte";

  let p1 = $state("");
  let p2 = $state("");
  let error = $state("");
  let ok = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    if (p1.length < 8) return void (error = "Hasło musi mieć co najmniej 8 znaków.");
    if (p1 !== p2) return void (error = "Wprowadzone hasła nie są identyczne.");
    try {
      await post("/auth/change-password", { password: p1, confirm: p2 });
      ok = true;
      setTimeout(() => (app.user = app.user && { ...app.user, wymus_zmiane_hasla: false, sesja_wersja: app.user.sesja_wersja + 1 }), 600);
    } catch (err: any) {
      error = err.message;
    }
  }
</script>

<div class="login-wrap">
  <div class="login-col">
    <Alert kind="warning" html="⚠️ Twoje konto wymaga zmiany hasła przed uzyskaniem dostępu do panelu." />
    <form class="form-card" onsubmit={submit} data-testid="form-force-password">
      <div class="field"><label for="np1">Nowe hasło (min. 8 znaków)</label><input id="np1" class="input" type="password" bind:value={p1} /></div>
      <div class="field"><label for="np2">Powtórz hasło</label><input id="np2" class="input" type="password" bind:value={p2} /></div>
      <button class="btn" type="submit">Zapisz nowe hasło i przejdź do systemu</button>
      {#if error}<div class="mt"><Alert kind="error" html={error} /></div>{/if}
      {#if ok}<div class="mt"><Alert kind="success" html="Hasło zostało zaktualizowane!" /></div>{/if}
    </form>
  </div>
</div>
