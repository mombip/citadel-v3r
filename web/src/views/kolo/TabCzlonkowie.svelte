<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { post, put, del } from "../../lib/api";
  import { can } from "../../../../shared/rbac";
  import { validateMemberDates, TIER_OPTIONS } from "../../../../shared/calculations";
  import { fmt, plnToGr } from "../../lib/format";
  import Radio from "../../components/Radio.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Checkbox from "../../components/Checkbox.svelte";
  import Alert from "../../components/Alert.svelte";

  let { members, koloId, today }: { members: any[]; koloId: number; today: string } = $props();
  const role = $derived(app.user!.rola);
  const opcje = $derived.by(() => {
    const o = ["➕ Dodaj nowego członka", "✏️ Edytuj profil członka"];
    if (can(role, "usuwa_czlonka")) o.push("🗑️ Usuń członka z koła");
    return o;
  });
  let tryb = $state("➕ Dodaj nowego członka");
  const tierOptions = TIER_OPTIONS.map((t) => [t, t] as [string, string]);
  const mapa = $derived(members.map((d) => [d.id, `${d.imie_nazwisko} (Saldo: ${fmt(d.saldo_akt_pln, 2)} zł)`] as [number, string]));

  // Add
  let aNazwa = $state("");
  let aUr = $state("2004-01-01");
  let aWst = $state(today);
  let aStart = $state(0.0);
  let aParam = $state("AUTO");
  let aErr = $state("");
  async function add(e: Event) {
    e.preventDefault();
    aErr = "";
    const [ok, msg] = validateMemberDates(aUr, aWst, today);
    if (!ok) return void (aErr = `⚠️ ${msg}`);
    if (!aNazwa.trim()) return void (aErr = "Imię i nazwisko jest wymagane.");
    try {
      await post(`/kolo/${koloId}/czlonkowie`, { imie_nazwisko: aNazwa.trim(), data_urodzenia: aUr, data_przystapienia: aWst, saldo_startowe_gr: plnToGr(aStart), reczny_parametr: aParam });
      app.toast("success", `Dodano członka: ${aNazwa}`);
      aNazwa = ""; aUr = "2004-01-01"; aWst = today; aStart = 0; aParam = "AUTO";
      app.refresh();
    } catch (e: any) { aErr = e.message; }
  }

  // Edit
  let edId = $state<number | null>(null);
  const osoba = $derived(members.find((m) => m.id === edId));
  let eNazwa = $state("");
  let eUr = $state(today);
  let eWst = $state(today);
  let eStart = $state(0);
  let eParam = $state("AUTO");
  let eConfirm = $state(false);
  let eErr = $state("");
  $effect(() => {
    if (osoba) {
      eNazwa = osoba.imie_nazwisko; eUr = osoba.data_ur < today ? osoba.data_ur : today; eWst = osoba.data_wst < today ? osoba.data_wst : today;
      eStart = osoba.saldo_start_gr / 100; eParam = TIER_OPTIONS.includes(osoba.reczny_parametr) ? osoba.reczny_parametr : "AUTO"; eConfirm = false;
    }
  });
  const critical = $derived(!!osoba && (eWst !== osoba.data_wst || plnToGr(eStart) !== osoba.saldo_start_gr));
  async function edit(e: Event) {
    e.preventDefault();
    eErr = "";
    const [ok, msg] = validateMemberDates(eUr, eWst, today);
    if (!ok) return void (eErr = `⚠️ ${msg}`);
    if (!eNazwa.trim()) return void (eErr = "Imię i nazwisko nie może być puste.");
    if (critical && !eConfirm) return void (eErr = "Zaznacz checkbox potwierdzający modyfikację parametrów krytycznych!");
    try {
      await put(`/kolo/${koloId}/czlonkowie/${edId}`, { imie_nazwisko: eNazwa.trim(), data_urodzenia: eUr, data_przystapienia: eWst, saldo_startowe_gr: plnToGr(eStart), reczny_parametr: eParam });
      app.toast("success", "Zaktualizowano dane członka.");
      app.refresh();
    } catch (e: any) { eErr = e.message; }
  }

  // Delete
  let delId = $state<number | null>(null);
  const kasowana = $derived(members.find((m) => m.id === delId));
  let delConfirm = $state(false);
  async function remove(e: Event) {
    e.preventDefault();
    if (!delConfirm || delId == null) return;
    await del(`/kolo/${koloId}/czlonkowie/${delId}`);
    app.toast("success", "Profil usunięty.");
    delConfirm = false;
    app.refresh();
  }
</script>

<div class="max-650">
  <Radio label="Operacja:" options={opcje} bind:value={tryb} name="tryb-czlonka" />
  {#if tryb === "➕ Dodaj nowego członka"}
    <form class="form-card" onsubmit={add} data-testid="form-dodaj-czlonka">
      <div class="field"><label for="a-nazwa">Imię i Nazwisko</label><input id="a-nazwa" class="input" bind:value={aNazwa} /></div>
      <div class="cols">
        <div class="col"><div class="field"><label for="a-ur">Data urodzenia</label><input id="a-ur" class="input" type="date" bind:value={aUr} min="1940-01-01" max={today} /></div></div>
        <div class="col"><div class="field"><label for="a-wst">Data przystąpienia</label><input id="a-wst" class="input" type="date" bind:value={aWst} min="2015-01-01" max={today} /></div></div>
      </div>
      <div class="cols">
        <div class="col"><NumberInput label="Saldo początkowe (PLN)" bind:value={aStart} min={-10000} max={10000} step={1} name="a-start" /></div>
        <div class="col"><Select label="Próg składek" options={tierOptions} bind:value={aParam} name="a-param" /></div>
      </div>
      <button class="btn" type="submit">Zapisz profil</button>
      {#if aErr}<div class="mt"><Alert kind="error" html={aErr} /></div>{/if}
    </form>
  {:else if tryb === "✏️ Edytuj profil członka" && members.length}
    <Select label="Wybierz członka:" options={mapa} bind:value={edId} name="e-czlonek" />
    {#if osoba}
      <form class="form-card" onsubmit={edit} data-testid="form-edytuj-czlonka">
        <div class="field"><label for="e-nazwa">Imię i Nazwisko</label><input id="e-nazwa" class="input" bind:value={eNazwa} /></div>
        <div class="field"><label for="e-ur">Data urodzenia</label><input id="e-ur" class="input" type="date" bind:value={eUr} min="1940-01-01" max={today} /></div>
        <div class="field"><label for="e-wst">Data przystąpienia</label><input id="e-wst" class="input" type="date" bind:value={eWst} min="2015-01-01" max={today} /></div>
        <NumberInput label="Saldo początkowe (PLN)" bind:value={eStart} step={1} name="e-start" />
        <Select label="Próg składek" options={tierOptions} bind:value={eParam} name="e-param" />
        {#if critical}
          <Alert kind="error" html="⚠️ Zmiana parametrów krytycznych przeliczy wstecznie KDI i naliczenia!" />
          <Checkbox label="Potwierdzam wsteczną modyfikację parametrów" bind:checked={eConfirm} name="e-confirm" />
        {/if}
        <button class="btn" type="submit">Zapisz zmiany w profilu</button>
        {#if eErr}<div class="mt"><Alert kind="error" html={eErr} /></div>{/if}
      </form>
    {/if}
  {:else if tryb === "🗑️ Usuń członka z koła" && members.length}
    <Select label="Wybierz członka do usunięcia:" options={mapa} bind:value={delId} name="d-czlonek" />
    {#if kasowana}
      <form class="form-card" onsubmit={remove} data-testid="form-usun-czlonka">
        <Alert kind="error" html={`⚠️ Usunięcie ${kasowana.imie_nazwisko} pozostawi jego wpłaty zarchiwizowane w kasie koła.`} />
        <Checkbox label={`Potwierdzam usunięcie profilu: ${kasowana.imie_nazwisko}`} bind:checked={delConfirm} name="d-confirm" />
        <button class="btn" type="submit">🔥 Usuń trwale profil</button>
      </form>
    {/if}
  {/if}
</div>
