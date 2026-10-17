<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get, post, put, del } from "../../lib/api";
  import { can } from "../../../../shared/rbac";
  import { fmt, zl, plnToGr } from "../../lib/format";
  import Radio from "../../components/Radio.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Checkbox from "../../components/Checkbox.svelte";
  import Alert from "../../components/Alert.svelte";
  import DataTable from "../../components/DataTable.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();
  const role = $derived(app.user!.rola);
  const direct = $derived(can(role, "bezposrednie_ksiegowanie"));
  const MIN = "2015-01-01";

  const opcje = $derived(members.map((d) => [d.id, `${d.imie_nazwisko} (Saldo: ${fmt(d.saldo_akt_pln, 2)} zł)`] as [number, string]));
  const tryby = ["➕ Nowa wpłata (Księgowanie)", "📥 Zgłoś do kolejki (Test)", "✏️ Popraw / Usuń wpłatę"];
  let tryb = $state(tryby[0]);

  // New payment (admin) / declaration (treasurer)
  let czlonek = $state<number | null>(null);
  let kwota = $state(9.0);
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let dataW = $state(today);
  let notatka = $state("Składka członkowska");
  let oswTest = $state("MAM_POTWIERDZENIE");
  let forceDup = $state(false);
  let token = $state(crypto.randomUUID());
  let err = $state("");
  let ok = $state("");
  const oswiadczenia = [
    "📄 Dysponuję potwierdzeniem przelewu i jestem świadomy że mogę zostać o nie poproszony przez Skarbnika Krajowego lub Administratora",
    "⚠️ Nie dysponuję potwierdzeniem Skarbnik krajowy lub administrator musi potwierdzić dane",
  ];
  let oswiadczenie = $state(oswiadczenia[0]);

  async function submitNew(e: Event) {
    e.preventDefault();
    err = "";
    ok = "";
    const body = { czlonek_id: czlonek, kwota_gr: plnToGr(kwota), data_wplaty: dataW, notatka, idempotency_key: token };
    try {
      if (tryb === tryby[0]) {
        await post(`/kolo/${koloId}/wplaty`, { ...body, force_duplicate: forceDup });
        token = crypto.randomUUID();
        ok = "Wpłata zarejestrowana bezpośrednio w księdze.";
      } else {
        await post(`/kolo/${koloId}/wplaty-oczekujace`, { ...body, idempotency_key: crypto.randomUUID(), oswiadczenie: oswTest });
        ok = "✅ Wpłata trafiła do kolejki weryfikacji.";
      }
      app.toast("success", ok);
      app.refresh();
    } catch (e: any) {
      if (e.body?.idempotent) { app.toast("warning", e.message); token = crypto.randomUUID(); } else err = e.message;
    }
  }

  async function submitDeclaration(e: Event) {
    e.preventDefault();
    err = "";
    ok = "";
    try {
      await post(`/kolo/${koloId}/wplaty-oczekujace`, {
        czlonek_id: czlonek, kwota_gr: plnToGr(kwota), data_wplaty: dataW, notatka, idempotency_key: token,
        oswiadczenie: oswiadczenie.includes("Dysponuję") ? "MAM_POTWIERDZENIE" : "BRAK_POTWIERDZENIA",
      });
      token = crypto.randomUUID();
      ok = "✅ Wpłata została zgłoszona do kolejki akceptacji!";
      app.toast("success", ok);
      app.refresh();
    } catch (e: any) {
      if (e.body?.idempotent) { app.toast("warning", "Ta wpłata została już wysłana."); token = crypto.randomUUID(); } else err = e.message;
    }
  }

  // Edit / delete (admin)
  let lista = $state<any[]>([]);
  $effect(() => {
    app.version;
    if (direct && tryb === tryby[2]) get(`/kolo/${koloId}/wplaty`).then((l) => (lista = l));
  });
  const edOptions = $derived(lista.map((w) => [w.id, `ID #${w.id} | ${w.data_wplaty} | ${w.imie_nazwisko ?? "Były członek"} | ${fmt(w.kwota_gr / 100, 2)} zł (${w.notatka})`] as [number, string]));
  let edId = $state<number | null>(null);
  const wpis = $derived(lista.find((w) => w.id === edId));
  let eCzl = $state<number | null>(null);
  let eKwota = $state(0);
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let eData = $state(today);
  let eNot = $state("");
  let eDel = $state(false);
  $effect(() => {
    if (wpis) { eCzl = wpis.czlonek_id ?? members[0]?.id ?? null; eKwota = wpis.kwota_gr / 100; eData = wpis.data_wplaty; eNot = String(wpis.notatka ?? ""); eDel = false; }
  });
  const mapaCzl = $derived(members.map((d) => [d.id, d.imie_nazwisko] as [number, string]));
  async function submitEdit(e: Event) {
    e.preventDefault();
    err = "";
    try {
      if (eDel) { await del(`/kolo/${koloId}/wplaty/${edId}`); app.toast("success", "Wpłata usunięta."); }
      else { await put(`/kolo/${koloId}/wplaty/${edId}`, { czlonek_id: eCzl, kwota_gr: plnToGr(eKwota), data_wplaty: eData, notatka: eNot }); app.toast("success", "Wpłata zaktualizowana."); }
      app.refresh();
    } catch (e: any) { err = e.message; }
  }

  // Recent declarations (treasurer)
  let ostatnie = $state<any[]>([]);
  $effect(() => {
    app.version;
    if (!direct) get(`/kolo/${koloId}/wplaty-oczekujace`).then((l) => (ostatnie = l));
  });
</script>

<div class="max-650">
  {#if !members.length}
    <Alert kind="warning" html="Najpierw wprowadź członków do bazy tego koła." />
  {:else if direct}
    <Radio label="Czynność:" options={tryby} bind:value={tryb} name="tryb-wplaty" />
    {#if tryb !== tryby[2]}
      <form class="form-card" onsubmit={submitNew} data-testid="form-wplata">
        <Select label="Członek" options={opcje} bind:value={czlonek} name="w-czlonek" />
        <NumberInput label="Kwota wpłaty (PLN)" bind:value={kwota} min={0.01} step={1} name="w-kwota" />
        <div class="field"><label for="w-data">Data wpływu</label><input id="w-data" class="input" type="date" bind:value={dataW} min={MIN} max={today} /></div>
        <div class="field"><label for="w-notatka">Tytuł / Notatka</label><input id="w-notatka" class="input" bind:value={notatka} /></div>
        {#if tryb === tryby[1]}
          <Select label="Oświadczenie testowe:" options={[["MAM_POTWIERDZENIE", "MAM_POTWIERDZENIE"], ["BRAK_POTWIERDZENIA", "BRAK_POTWIERDZENIA"]]} bind:value={oswTest} name="w-osw" />
        {/if}
        <Checkbox label="Potwierdzam celowe dodanie kolejnej identycznej wpłaty (w ciągu 60s)" bind:checked={forceDup} name="w-dup" />
        <button class="btn" type="submit">{tryb.includes("Księgowanie") ? "Zaksięguj wpłatę bezpośrednio" : "Wyślij do kolejki weryfikacji"}</button>
        {#if err}<div class="mt"><Alert kind="error" html={err} /></div>{/if}
        {#if ok}<div class="mt"><Alert kind="success" html={ok} /></div>{/if}
      </form>
    {:else if !lista.length}
      <Alert kind="info" html="Brak wpłat do modyfikacji w tym kole." />
    {:else}
      <Select label="Wybierz wpłatę:" options={edOptions} bind:value={edId} name="w-edit" />
      {#if wpis}
        <form class="form-card" onsubmit={submitEdit} data-testid="form-wplata-edycja">
          <Select label="Osoba" options={mapaCzl} bind:value={eCzl} name="e-osoba" />
          <NumberInput label="Kwota (PLN)" bind:value={eKwota} min={0.01} step={1} name="e-kwota" />
          <div class="field"><label for="e-data">Data wpłaty</label><input id="e-data" class="input" type="date" bind:value={eData} min={MIN} max={today} /></div>
          <div class="field"><label for="e-not">Notatka</label><input id="e-not" class="input" bind:value={eNot} /></div>
          <Checkbox label="🔥 Całkowicie usuń tę wpłatę z rejestru" bind:checked={eDel} name="e-del" />
          <button class="btn" type="submit">Zastosuj operację</button>
          {#if err}<div class="mt"><Alert kind="error" html={err} /></div>{/if}
        </form>
      {/if}
    {/if}
  {:else}
    <h4>📥 Zadeklaruj Wpłatę Członka</h4>
    <Alert kind="info" html="ℹ️ Jako Skarbnik Koła/Regionu deklarujesz wpłatę. Zostanie zaksięgowana w kasie po zatwierdzeniu przez Skarbnika Krajowego lub Administratora." />
    <form class="form-card" onsubmit={submitDeclaration} data-testid="form-deklaracja">
      <Select label="Wybierz członka" options={opcje} bind:value={czlonek} name="d-czlonek" />
      <NumberInput label="Kwota deklarowanej wpłaty (PLN)" bind:value={kwota} min={0.01} step={1} name="d-kwota" />
      <div class="field"><label for="d-data">Data wpływu na konto</label><input id="d-data" class="input" type="date" bind:value={dataW} min={MIN} max={today} /></div>
      <div class="field"><label for="d-not">Tytuł przelewu / Notatka</label><input id="d-not" class="input" bind:value={notatka} /></div>
      <p><strong>Wymagane oświadczenie weryfikacyjne:</strong></p>
      <Radio label="Status potwierdzenia przelewu:" options={oswiadczenia} bind:value={oswiadczenie} horizontal={false} name="d-osw" />
      <button class="btn" type="submit">Wyślij wpłatę do zaakceptowania</button>
      {#if err}<div class="mt"><Alert kind="error" html={err} /></div>{/if}
      {#if ok}<div class="mt"><Alert kind="success" html={ok} /></div>{/if}
    </form>
    <hr />
    <h4>⏳ Ostatnie wpłaty zgłoszone w tym kole</h4>
    {#if ostatnie.length}
      <DataTable testid="ostatnie-deklaracje" columns={[
        { key: "id", label: "ID", numeric: true }, { key: "data_wplaty", label: "Data Przelewu" }, { key: "czlonek", label: "Członek" },
        { key: "kwota", label: "Kwota (PLN)", numeric: true }, { key: "status", label: "Status" }, { key: "oswiadczenie", label: "Oświadczenie" },
      ]} rows={ostatnie.map((o) => ({ ...o, kwota: String(o.kwota_gr / 100) }))} />
    {:else}
      <p class="caption">Brak zgłoszonych oczekujących wpłat.</p>
    {/if}
  {/if}
</div>
