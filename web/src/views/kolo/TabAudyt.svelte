<script lang="ts">
  import { app } from "../../lib/state.svelte";
  import { get } from "../../lib/api";
  import { fmt, formatTimePL } from "../../lib/format";
  import Tabs from "../../components/Tabs.svelte";
  import Select from "../../components/Select.svelte";
  import DataTable from "../../components/DataTable.svelte";
  import Alert from "../../components/Alert.svelte";

  let { koloId }: { koloId: number } = $props();
  let sub = $state(0);
  const tabele = ["Wszystkie", "czlonkowie", "wplaty", "wplaty_oczekujace", "naliczenia_reczne", "korekty", "wydatki", "korekty_kasy", "kola", "regiony", "uzytkownicy"];
  let tabela = $state("Wszystkie");
  let logi = $state<any[] | null>(null);
  $effect(() => {
    app.version;
    const t = tabela;
    logi = null;
    get(`/audit?table=${encodeURIComponent(t)}`).then((l) => (logi = l));
  });
  let rejestr = $state<any[] | null>(null);
  $effect(() => {
    app.version;
    if (sub === 1) get(`/kolo/${koloId}/rejestr-wplat`).then((l) => (rejestr = l));
  });
  let backupInfo = $state("");
  let backupUrl = $state("");
  let backupName = $state("");
  let busy = $state(false);
  async function generate() {
    busy = true;
    try {
      const res = await fetch("/api/backup", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Nie udało się wygenerować zrzutu.");
      const blob = await res.blob();
      backupName = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "citadel_backup.sql";
      if (backupUrl) URL.revokeObjectURL(backupUrl);
      backupUrl = URL.createObjectURL(blob);
      backupInfo = `✅ Zrzut gotowy! Rozmiar: ${fmt(blob.size / 1024, 1)} KB`;
    } catch (e: any) { app.toast("error", e.message); } finally { busy = false; }
  }
  const json = (v: any) => (v === null || v === undefined ? "None" : JSON.stringify(v));
</script>

<Tabs labels={["🛡️ Dziennik Audytu Zdarzeń (Trigger PG)", "💰 Rejestr Wpłat", "💾 Kopia Zapasowa (.sql)"]} bind:active={sub} testid="audyt-tabs" />
{#if sub === 0}
  <h4>🛡️ Rejestr Zmian Systemowych (PostgreSQL Audit Trigger)</h4>
  <Select label="Filtruj tabelę:" options={tabele.map((t) => [t, t])} bind:value={tabela} name="audit-tabela" />
  {#if !logi}
    <div class="spinner">Ładowanie…</div>
  {:else if !logi.length}
    <Alert kind="info" html="Brak zarejestrowanych wpisów w dzienniku audytu." />
  {:else}
    <DataTable testid="audit-table" columns={[
      { key: "id", label: "id", numeric: true }, { key: "czas", label: "Czas (PL)" }, { key: "tabela", label: "tabela" }, { key: "operacja", label: "operacja" },
      { key: "rekord_id", label: "rekord_id", numeric: true }, { key: "stare", label: "stare_dane" }, { key: "nowe", label: "nowe_dane" },
    ]} rows={logi.map((l) => ({ ...l, czas: formatTimePL(l.zmieniono_o), stare: json(l.stare_dane), nowe: json(l.nowe_dane) }))} />
  {/if}
{:else if sub === 1}
  {#if !rejestr}
    <div class="spinner">Ładowanie…</div>
  {:else if !rejestr.length}
    <Alert kind="info" html="Brak wpłat w historii tego koła." />
  {:else}
    <DataTable testid="rejestr-wplat" columns={[
      { key: "id", label: "ID", numeric: true }, { key: "zarejestrowano", label: "Zarejestrowano (PL)" }, { key: "data_wplaty", label: "Data Wpływu" },
      { key: "czlonek", label: "Członek" }, { key: "kwota", label: "Kwota (PLN)", numeric: true }, { key: "notatka", label: "Uwagi" },
    ]} rows={rejestr.map((w) => ({ ...w, zarejestrowano: formatTimePL(w.data_wpisu), kwota: fmt(w.kwota_gr / 100, 2) }))} />
  {/if}
{:else}
  <h4>💾 Pełna Kopia Zapasowa Bazy Danych (.sql)</h4>
  <button class="btn" type="button" onclick={generate} disabled={busy} data-testid="btn-backup">🚀 Wygeneruj zrzut bazy (.sql)</button>
  {#if backupInfo}
    <div class="mt"><Alert kind="success" html={backupInfo} /></div>
    <a class="btn" href={backupUrl} download={backupName} data-testid="btn-backup-download">📥 Pobierz plik bazy (.sql)</a>
  {/if}
{/if}
