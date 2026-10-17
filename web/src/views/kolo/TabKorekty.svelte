<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { post } from "../../lib/api";
  import { fmt, plnToGr } from "../../lib/format";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Alert from "../../components/Alert.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();
  const opcje = $derived(members.map((d) => [d.id, `${d.imie_nazwisko} | Obecne saldo: ${fmt(d.saldo_akt_pln, 2)} zł`] as [number, string]));
  let czlonek = $state<number | null>(null);
  let saldo = $state(0.0);
  let data = $state(today);
  let powod = $state("Wyrównanie ze stanem papierowym");
  let err = $state("");

  async function submit(e: Event) {
    e.preventDefault();
    err = "";
    try {
      const r = await post<{ delta_gr: number }>(`/kolo/${koloId}/korekty`, { czlonek_id: czlonek, docelowe_saldo_gr: plnToGr(saldo), data_korekty: data, powod });
      app.toast("success", `Zaktualizowano saldo o deltę: ${fmt(r.delta_gr / 100, 2, { sign: true })} zł.`);
      saldo = 0; data = today; powod = "Wyrównanie ze stanem papierowym";
      app.refresh();
    } catch (e: any) { err = e.message; }
  }
</script>

<div class="max-550">
  {#if !members.length}
    <Alert kind="warning" html="Brak członków w kole." />
  {:else}
    <form class="form-card" onsubmit={submit} data-testid="form-korekta">
      <Select label="Wybierz członka:" options={opcje} bind:value={czlonek} name="k-czlonek" />
      <NumberInput label="Docelowe nowe saldo (PLN)" bind:value={saldo} step={1} name="k-saldo" />
      <div class="field"><label for="k-data">Data korekty</label><input id="k-data" class="input" type="date" bind:value={data} min="2015-01-01" max={today} /></div>
      <div class="field"><label for="k-powod">Powód korekty</label><input id="k-powod" class="input" bind:value={powod} /></div>
      <button class="btn" type="submit">Zastosuj korektę członka</button>
      {#if err}<div class="mt"><Alert kind="error" html={err} /></div>{/if}
    </form>
  {/if}
</div>
