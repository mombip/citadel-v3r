<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post, del } from "../../lib/api";
  import { fmt, plnToGr } from "../../lib/format";
  import Radio from "../../components/Radio.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Alert from "../../components/Alert.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();
  const tryby = ["➕ Nowe naliczenie", "📋 Przeglądaj / Usuń naliczenie"];
  let tryb = $state(tryby[0]);
  const opcje = $derived(members.map((d) => [d.id, `${d.imie_nazwisko} (Saldo: ${fmt(d.saldo_akt_pln, 2)} zł)`] as [number, string]));
  let czlonek = $state<number | null>(null);
  let kwota = $state(9.0);
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let data = $state(today);
  let tytul = $state("Składka statutowa");
  let err = $state("");

  async function add(e: Event) {
    e.preventDefault();
    err = "";
    if (!tytul.trim()) return;
    try {
      await post(`/kolo/${koloId}/naliczenia`, { czlonek_id: czlonek, kwota_gr: plnToGr(kwota), data_naliczenia: data, tytul: tytul.trim() });
      app.toast("success", "Zaksięgowano ręczne obciążenie.");
      kwota = 9.0; data = today; tytul = "Składka statutowa";
      app.refresh();
    } catch (e: any) { err = e.message; }
  }

  let lista = $state<any[]>([]);
  $effect(() => {
    app.version;
    if (tryb === tryby[1]) get(`/kolo/${koloId}/naliczenia`).then((l) => (lista = l));
  });
  const usunOptions = $derived(lista.map((r) => [r.id, `ID #${r.id} | ${r.data_naliczenia} | ${r.imie_nazwisko} | ${fmt(r.kwota_gr / 100, 2)} zł (${r.tytul})`] as [number, string]));
  let usunId = $state<number | null>(null);
  async function remove() {
    if (usunId == null) return;
    await del(`/kolo/${koloId}/naliczenia/${usunId}`);
    app.toast("success", "Naliczenie usunięte.");
    app.refresh();
  }
</script>

<div class="max-650">
  <Radio label="Czynność:" options={tryby} bind:value={tryb} name="tryb-nal" />
  {#if !members.length}
    <Alert kind="warning" html="Najpierw wprowadź członków do bazy tego koła." />
  {:else if tryb === tryby[0]}
    <form class="form-card" onsubmit={add} data-testid="form-naliczenie">
      <Select label="Członek" options={opcje} bind:value={czlonek} name="n-czlonek" />
      <NumberInput label="Kwota naliczenia (PLN)" bind:value={kwota} min={0.01} step={1} name="n-kwota" />
      <div class="field"><label for="n-data">Data naliczenia</label><input id="n-data" class="input" type="date" bind:value={data} min="2015-01-01" max={today} /></div>
      <div class="field"><label for="n-tytul">Tytuł obciążenia</label><input id="n-tytul" class="input" bind:value={tytul} /></div>
      <button class="btn" type="submit">Zaksięguj naliczenie</button>
      {#if err}<div class="mt"><Alert kind="error" html={err} /></div>{/if}
    </form>
  {:else if !lista.length}
    <Alert kind="info" html="Brak ręcznych naliczeń." />
  {:else}
    <Select label="Wpis do usunięcia:" options={usunOptions} bind:value={usunId} name="n-usun" />
    <button class="btn" type="button" onclick={remove} data-testid="btn-usun-naliczenie">🔥 Usuń to naliczenie z konta</button>
  {/if}
</div>
