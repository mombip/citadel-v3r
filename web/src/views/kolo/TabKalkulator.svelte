<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { CUTOFF_DATE, formatKdiValue, getTier, simulateCalculator } from "../../../../shared/calculations";
  import { maxDate } from "../../../../shared/dates";
  import { pyRound } from "../../../../shared/num";
  import { fmt, kdiColor, glow, plnToGr } from "../../lib/format";
  import BentoCard from "../../components/BentoCard.svelte";
  import Radio from "../../components/Radio.svelte";
  import Select from "../../components/Select.svelte";
  import NumberInput from "../../components/NumberInput.svelte";
  import Checkbox from "../../components/Checkbox.svelte";
  import Alert from "../../components/Alert.svelte";
  import Expander from "../../components/Expander.svelte";

  let { today }: { today: string } = $props();

  const tryby = ["🎂 Automatycznie z daty urodzenia (Wiek)", "🏷️ Ręczny wybór progu (B / M / S)"];
  let tryb = $state(tryby[0]);
  let dataUr = $state("2005-10-10");
  const stawki = ["M (9.00 zł / msc)", "B (6.00 zł / msc)", "S (15.00 zł / msc)"];
  let stawka = $state(stawki[0]);
  const auto = $derived(tryb === tryby[0]);
  const paramKod = $derived(auto ? "AUTO" : stawka[0]);
  const birth = $derived(auto ? dataUr : "2000-01-01");
  let dataWst = $state("2023-09-12");
  // svelte-ignore state_referenced_locally -- form default captured on mount, like Streamlit's widget value=
  let punkt = $state(today);
  const startOpcje = [
    "Od daty przystąpienia członka",
    "Od początku 2025 r. (01.01.2025 - Nowa Uchwała)",
    "Od początku 2026 r. (01.01.2026)",
    "Od systemowej daty odcięcia (01.10.2026)",
    "Własna data początkowa",
  ];
  let startOpcja = $state(startOpcje[0]);
  let wlasnaData = $state("2025-01-01");
  const chargesFrom = $derived.by(() => {
    switch (startOpcja) {
      case startOpcje[1]: return maxDate(dataWst, "2025-01-01");
      case startOpcje[2]: return maxDate(dataWst, "2026-01-01");
      case startOpcje[3]: return maxDate(dataWst, CUTOFF_DATE);
      case startOpcje[4]: return wlasnaData;
      default: return dataWst;
    }
  });
  let biezacy = $state(false);
  const funkcje = [
    "Brak funkcji (0 zł)",
    "Członek Zarządu Krajowego (+20 zł / msc)",
    "Przewodniczący Regionu / Koła / Rada Krajowa / KKRD (+10 zł / msc)",
    "Inna kwota funkcyjna (własna)",
  ];
  let funkcja = $state(funkcje[0]);
  let wlasnaStawka = $state(10.0);
  const stawkaFn = $derived(funkcja === funkcje[1] ? 20 : funkcja === funkcje[2] ? 10 : funkcja === funkcje[3] ? wlasnaStawka : 0);
  let miesiaceFn = $state(0);
  const mFn = $derived(stawkaFn > 0 ? miesiaceFn : 0);
  let saldoStart = $state(0.0);
  let wplaty = $state(0.0);

  const sim = $derived(simulateCalculator(dataWst, birth, paramKod, punkt, chargesFrom, biezacy, plnToGr(stawkaFn), mFn));
  const tier = $derived(getTier(birth, paramKod, punkt));
  const stawkaBiezacaPln = $derived(tier[1] / 100);
  const saldoKoncoweGr = $derived(plnToGr(saldoStart) + plnToGr(wplaty) - sim.totalGr);
  const saldoKoncowe = $derived(saldoKoncoweGr / 100);
  const s_i = $derived(Math.max(0, plnToGr(saldoStart)) + plnToGr(wplaty));
  const z_i = $derived(Math.max(0, s_i - saldoKoncoweGr));
  const kdi = $derived(s_i > 0 ? pyRound(z_i / s_i, 2) : null);
  const kdiStr = $derived(kdi !== null ? fmt(kdi, 2) : "Brak danych");
  const safeRate = $derived(Math.max(tier[1], 1));
  const minPay = $derived(Math.max(0, z_i - 6 * safeRate));
  const progVal = $derived(minPay > 0 ? pyRound(z_i / minPay, 2) : null);
  const progStr = $derived(progVal !== null ? `≤ ${fmt(progVal, 2)}` : "pełna karencja");
  const kdiHtml = $derived(formatKdiValue(kdiStr, progVal, progStr));
  const mDlugu = $derived(saldoKoncoweGr >= 0 ? 0 : Math.abs(saldoKoncoweGr) / safeRate);
  const mozeGlosowac = $derived(saldoKoncoweGr >= 0 || mDlugu <= 6.0);
  const doplataGlos = $derived(saldoKoncoweGr >= 0 ? 0 : Math.max(0, Math.abs(saldoKoncoweGr) - 6 * tier[1]) / 100);
  const doplataZero = $derived(Math.max(0, -saldoKoncowe));
  const etykiety: Record<string, string> = {
    "STARA_<16": "0 zł (Stara Uchwała: < 16 lat)", "STARA_16-20": "5 zł (Stara Uchwała: 16–20 lat)", "STARA_21+": "10 zł (Stara Uchwała: 21+ lat)",
    B: "6 zł (Nowa Uchwała: < 20 lat)", M: "9 zł (Nowa Uchwała: 20–29 lat)", S: "15 zł (Nowa Uchwała: 30+ lat)",
  };
  const detale = $derived.by(() => {
    const d = Object.entries(sim.tierHistory).sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, cnt]) => `• <strong>${cnt} msc</strong> × ${etykiety[p] ?? p}`);
    if (sim.functionalGr > 0) d.push(`• <strong>${mFn} msc</strong> × ${fmt(stawkaFn, 2)} zł (Składka funkcyjna) = <strong>${fmt(sim.functionalGr / 100, 2)} zł</strong>`);
    return d;
  });
  let symDoplata = $state(0);
  $effect(() => { symDoplata = doplataGlos; });
  const symMax = $derived(Math.max(100, doplataZero + 50));
  const symSaldo = $derived(saldoKoncowe + symDoplata);
  const symMsc = $derived(symSaldo < 0 ? Math.abs(symSaldo) / stawkaBiezacaPln : 0);
  const symGlos = $derived(symSaldo >= 0 || symMsc <= 6.0);
</script>

<h3>🧮 Podręczny Kalkulator Składek i Mandatów</h3>
<p class="caption">Symulator obsługujący dynamiczne zmiany progów wiekowych, Starą Uchwałę nr 1/2023 (do 31.12.2024), Nową Uchwałę (od 01.01.2025) oraz składki funkcyjne.</p>

<div class="cols gap-large">
  <div class="col" style="flex: 1.1">
    <h4>📥 Parametry Członka</h4>
    <Radio label="Sposób ustalania stawki miesięcznej:" options={tryby} bind:value={tryb} name="calc-tryb" />
    <div class="cols">
      <div class="col">
        {#if auto}
          <div class="field"><label for="calc-ur">Data urodzenia</label><input id="calc-ur" class="input" type="date" bind:value={dataUr} min="1940-01-01" max={today} /></div>
        {:else}
          <div class="field"><label for="calc-ur-x">Data urodzenia</label><input id="calc-ur-x" class="input" value="Pominięto (tryb ręczny)" disabled /></div>
        {/if}
      </div>
      <div class="col">
        {#if auto}
          <div class="field"><label for="calc-prog">Wybrany próg</label><input id="calc-prog" class="input" value="AUTO (wg wieku)" disabled /></div>
        {:else}
          <Select label="Próg składek:" options={stawki.map((s) => [s, s])} bind:value={stawka} name="calc-stawka" />
        {/if}
      </div>
    </div>
    <div class="cols">
      <div class="col"><div class="field"><label for="calc-wst">Data przystąpienia</label><input id="calc-wst" class="input" type="date" bind:value={dataWst} min="2015-01-01" max={today} /></div></div>
      <div class="col"><div class="field"><label for="calc-punkt">Kalkulacja na dzień:</label><input id="calc-punkt" class="input" type="date" bind:value={punkt} min="2015-01-01" /></div></div>
    </div>
    <Select label="Naliczaj składki od:" options={startOpcje.map((s) => [s, s])} bind:value={startOpcja} name="calc-start" />
    {#if startOpcja === startOpcje[4]}
      <div class="field"><label for="calc-wlasna">Własna data początkowa naliczania:</label><input id="calc-wlasna" class="input" type="date" bind:value={wlasnaData} min="2015-01-01" /></div>
    {/if}
    <Checkbox label="Uwzględnij bieżący (niepełny) miesiąc w naliczeniu" bind:checked={biezacy} name="calc-biezacy" />
    <hr />
    <h4>🏛️ Składka Funkcyjna (Uchwała nr 1/2023)</h4>
    <div class="cols">
      <div class="col">
        <Select label="Pełniona funkcja w organizacji:" options={funkcje.map((f) => [f, f])} bind:value={funkcja} name="calc-funkcja" />
        {#if funkcja === funkcje[3]}<NumberInput label="Miesięczna stawka funkcyjna (PLN):" bind:value={wlasnaStawka} min={0} step={5} name="calc-fn-stawka" />{/if}
      </div>
      <div class="col">
        {#if stawkaFn > 0}
          <NumberInput label="Liczba miesięcy pełnienia funkcji:" bind:value={miesiaceFn} min={0} max={120} step={1} decimals={0} name="calc-fn-msc" />
        {:else}
          <div class="field"><label for="calc-fn-x">Liczba miesięcy pełnienia funkcji:</label><input id="calc-fn-x" class="input" value="0 (brak)" disabled /></div>
        {/if}
      </div>
    </div>
    <hr />
    <h4>💰 Wartości Finansowe</h4>
    <div class="cols">
      <div class="col"><NumberInput label="Saldo początkowe (PLN)" bind:value={saldoStart} min={-10000} max={10000} step={10} name="calc-s-start" /></div>
      <div class="col"><NumberInput label="Suma dotychczasowych wpłat (PLN)" bind:value={wplaty} min={0} max={50000} step={10} name="calc-wpl" /></div>
    </div>
  </div>

  <div class="col" style="flex: 1.4" data-testid="calc-result">
    <h4>📊 Wynik Symulacji</h4>
    <div class="cols">
      <div class="col"><BentoCard title="Saldo Końcowe" value={`${fmt(saldoKoncowe, 2, { thousands: true })} PLN`} sub={`Start: ${fmt(saldoStart, 2)} zł | Wpłaty: ${fmt(wplaty, 2)} zł`} accent={saldoKoncowe >= 0 ? "accent-green" : "accent-rose"} /></div>
      <div class="col"><BentoCard title="Wskaźnik KDI" value={kdiHtml} sub="Cel statutowy: ≤ 1.20" style={glow(kdiColor(kdi, app.isLight))} /></div>
    </div>
    <div class="cols">
      <div class="col"><BentoCard title="Prawo Głosu (Karencja ≤ 6 msc)" value={mozeGlosowac ? "TAK (UPRAWNIONY)" : "NIE (ZAWIESZONY)"} sub={`Zadłużenie: ${fmt(mDlugu, 1)} msc (limit: 6.0 msc)`} style={`color: ${mozeGlosowac ? "#22c55e" : "#f43f5e"}; font-size: 1.45rem;`} /></div>
      <div class="col"><BentoCard title="Naliczone Składki" value={`${fmt(sim.totalGr / 100, 2, { thousands: true })} PLN`} sub={`${sim.months} msc | Próg bieżący: ${tier[0]}${sim.functionalGr > 0 ? ` (+${fmt(sim.functionalGr / 100, 2)} zł funkcyjne)` : ""}`} accent="accent-cyan" /></div>
    </div>
    {#if detale.length}
      <Alert kind="info" html={`📋 <strong>Rozbicie naliczeń w okresie symulacji:</strong><br><br>${detale.join("<br>")}`} />
    {/if}
    <h5>📋 Rekomendacja dla wpłacającego:</h5>
    {#if saldoKoncowe >= 0}
      <Alert kind="success" html={`✅ <strong>Konto w pełni uregulowane.</strong> Nadpłata wynosi <strong>${fmt(saldoKoncowe, 2)} zł</strong>. Członek ma pewne prawo głosu na zebraniach.`} />
    {:else if mozeGlosowac}
      <Alert kind="warning" html={`⚠️ <strong>Zadłużenie w granicach karencji (${fmt(mDlugu, 1)} msc długu).</strong> Członek zachowuje prawo głosu. Do pełnego wyzerowania konta brakuje: <strong>${fmt(doplataZero, 2)} zł</strong>.`} />
    {:else}
      <Alert kind="error" html={`❌ <strong>Utrata prawa głosu!</strong> Zadłużenie przekracza limit 6 miesięcy (wynosi <strong>${fmt(mDlugu, 1)} msc</strong>).<ul><li>Aby <strong>przywrócić prawo głosu</strong>, członek musi wpłacić minimum: <strong>${fmt(doplataGlos, 2)} zł</strong></li><li>Aby <strong>całkowicie wyzerować zadłużenie</strong>, należy wpłacić: <strong>${fmt(doplataZero, 2)} zł</strong></li></ul>`} />
    {/if}
    <Expander title="🔍 Symulacja natychmiastowej dopłaty (Co jeśli wpłaci X zł?)">
      <div class="field">
        <label for="calc-sym">Symulowana kwota przelewu (PLN): <strong>{fmt(symDoplata, 2)}</strong></label>
        <input id="calc-sym" class="slider" type="range" min="0" max={symMax} step="5" bind:value={symDoplata} />
        <div class="slider-scale"><span>0.00</span><span>{fmt(symMax, 2)}</span></div>
      </div>
      <p>• Nowe saldo po dopłacie: <strong>{fmt(symSaldo, 2, { sign: true })} zł</strong></p>
      <p>• Nowe zadłużenie: <strong>{fmt(symMsc, 1)} miesięcy</strong></p>
      <p>• Status głosu: <strong>{symGlos ? "✅ UPRAWNIONY" : "❌ NADAL BEZ PRAWA GŁOSU"}</strong></p>
    </Expander>
  </div>
</div>
