<script lang="ts">
  import { app } from "../lib/state.svelte";
  /** Read-only grid (port of st.dataframe with Styler colouring). */
  export interface Column<T = any> {
    key: string;
    label: string;
    /** Returns a CSS style string for the cell (like pandas Styler.map). */
    style?: (value: any, row: T) => string;
    /** Custom text; defaults to the raw value. */
    render?: (value: any, row: T) => string;
    numeric?: boolean;
    wrap?: boolean;
  }
  let { columns, rows, testid = "table", maxHeight = "" }: { columns: Column[]; rows: any[]; testid?: string; maxHeight?: string } = $props();
  const text = (c: Column, r: any) => {
    const v = r[c.key];
    if (c.render) return c.render(v, r);
    if (v === null || v === undefined) return "None";
    return String(v);
  };
</script>

<div class="table-wrap" data-testid={testid} style={maxHeight ? `max-height:${maxHeight}` : ""}>
  {#key app.theme}
  <table class="df">
    <thead>
      <tr>{#each columns as c}<th class:num={c.numeric}>{c.label}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each rows as r}
        <tr>
          {#each columns as c}
            <td class:num={c.numeric} class:wrap={c.wrap} style={c.style ? c.style(r[c.key], r) : ""}>{text(c, r)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {/key}
</div>
