<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "./lib/state.svelte";
  import Login from "./views/Login.svelte";
  import ForcePassword from "./views/ForcePassword.svelte";
  import Header from "./views/Header.svelte";
  import ViewKraj from "./views/ViewKraj.svelte";
  import ViewRegion from "./views/ViewRegion.svelte";
  import ViewKolo from "./views/ViewKolo.svelte";
  import Alert from "./components/Alert.svelte";

  onMount(() => app.boot());

  let dictError = $state("");
  $effect(() => {
    if (app.user && !app.user.wymus_zmiane_hasla) {
      app.version; // re-load dictionaries after mutations (pending count, new regions)
      app.loadDictionaries().catch((e) => (dictError = e.message));
    }
  });
</script>

<div class="app">
  {#if !app.booted}
    <div class="spinner">Ładowanie…</div>
  {:else if !app.user}
    <Login />
  {:else if app.user.wymus_zmiane_hasla}
    <ForcePassword />
  {:else if !app.dict}
    {#if dictError}<Alert kind="error" html={dictError} />{:else}<div class="spinner">Ładowanie…</div>{/if}
  {:else}
    <Header />
    {#if app.viewMode === "🇵🇱 Statystyki Kraju"}
      <ViewKraj />
    {:else if app.viewMode === "📊 Statystyki Regionu"}
      <ViewRegion />
    {:else}
      <ViewKolo />
    {/if}
  {/if}
</div>

<div class="toast-stack" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <Alert kind={t.kind} html={t.text} />
  {/each}
</div>
