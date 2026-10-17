<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post } from "../../lib/api";
  import { fmt } from "../../lib/format";
  import Alert from "../../components/Alert.svelte";
  import Expander from "../../components/Expander.svelte";

  let pending = $state<any[] | null>(null);
  let powody = $state<Record<number, string>>({});
  $effect(() => {
    app.version;
    get("/pending").then((p) => (pending = p));
  });
  async function accept(id: number) {
    try {
      await post(`/pending/${id}/accept`);
      app.toast("success", "Zaksięgowano wpłatę.");
      app.refresh();
    } catch (e: any) { app.toast("error", e.message); }
  }
  async function reject(id: number) {
    await post(`/pending/${id}/reject`, { powod: powody[id] ?? "Brak wpływu na wyciągu" });
    app.toast("warning", "Wpłata odrzucona.");
    app.refresh();
  }
</script>

<h3>📥 Kolejka Weryfikacji Wpłat</h3>
<p class="caption">Wpłaty zadeklarowane przez Skarbników Kół i Regionów.</p>
{#if !pending}
  <div class="spinner">Ładowanie…</div>
{:else if !pending.length}
  <Alert kind="success" html="🎉 Brak oczekujących wpłat. Wszystkie transakcje są rozpatrzone!" />
{:else}
  {#each pending as r (r.id)}
    <div data-testid="pending-row">
      <p><strong>{r.czlonek_nazwa ?? "Brak przypisania"}</strong> ({r.kolo_nazwa}) — <strong>{fmt(r.kwota_gr / 100, 2)} zł</strong> | Przelew: <strong>{r.data_wplaty}</strong> | Zgłosił: {r.zglosil_nazwa}</p>
      <div class="cols">
        <div class="col"><button class="btn" type="button" onclick={() => accept(r.id)}>✅ Akceptuj wpłatę #{r.id}</button></div>
        <div class="col">
          <Expander title="❌ Odrzuć wpłatę">
            <div class="field"><label for="odrzuc-{r.id}">Powód odrzucenia:</label><input id="odrzuc-{r.id}" class="input" value={powody[r.id] ?? "Brak wpływu na wyciągu"} oninput={(e) => (powody[r.id] = (e.target as HTMLInputElement).value)} /></div>
            <button class="btn" type="button" onclick={() => reject(r.id)}>Potwierdź odrzucenie</button>
          </Expander>
        </div>
      </div>
      <hr />
    </div>
  {/each}
{/if}
