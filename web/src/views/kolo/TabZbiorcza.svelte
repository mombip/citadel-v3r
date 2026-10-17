<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { fmt, zl, kdiCellStyle, kdiThresholdStyle, voteStyle } from "../../lib/format";
  import { celestiaColor } from "../../../../shared/celestia";
  import DataTable from "../../components/DataTable.svelte";
  import Alert from "../../components/Alert.svelte";

  let { members, koloName }: { members: any[]; koloName: string } = $props();

  const rows = $derived(members.map((d) => ({
    id: d.id,
    czlonek: d.imie_nazwisko,
    prog: `Parametr ${d.parametr}`,
    saldoStart: zl(d.saldo_start_gr),
    korekty: zl(d.korekty_gr),
    naliczone: `${zl(d.naliczone_gr)} (${d.msc} msc${d.liczba_recznych > 0 ? ` + ${d.liczba_recznych} ręczne)` : ")"}`,
    wplacone: zl(d.wplaty_gr),
    saldoAkt: `${fmt(d.saldo_akt_pln, 2)} zł`,
    kdi: d.kdi_str,
    progKdi: d.kdi_prog_str ?? "—",
    celestia: d.celestia_rating ?? "—",
    glos: d.glosowanie_str,
  })));

  const columns = $derived([
    { key: "id", label: "ID", numeric: true },
    { key: "czlonek", label: "Członek" },
    { key: "prog", label: "Próg" },
    { key: "saldoStart", label: "Saldo Start" },
    { key: "korekty", label: "Korekty" },
    { key: "naliczone", label: "Naliczone" },
    { key: "wplacone", label: "Wpłacone" },
    { key: "saldoAkt", label: "Saldo Aktualne" },
    { key: "kdi", label: "Wskaźnik KDI", style: (v: string) => kdiCellStyle(v, app.isLight) },
    { key: "progKdi", label: "Próg KDI (głos)", style: (v: string) => kdiThresholdStyle(v, app.isLight) },
    { key: "celestia", label: "Celestia", style: (v: string) => `color: ${celestiaColor(v, app.isLight)}; font-weight: 800;` },
    { key: "glos", label: "Możliwość głosowania", style: voteStyle },
  ]);
</script>

{#if !members.length}
  <Alert kind="info" html={`Baza dla koła '${koloName}' jest pusta. Dodaj pierwszego członka.`} />
{:else}
  <DataTable {columns} {rows} testid="zbiorcza-table" />
{/if}
