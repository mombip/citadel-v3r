<script lang="ts">
  /** st.selectbox: options are [value, label] pairs; value is bound as string|number|null. */
  let { label = "", options, value = $bindable(), disabled = false, name = "" }:
    { label?: string; options: [any, string][]; value?: any; disabled?: boolean; name?: string } = $props();
  const key = (v: any) => (v === null || v === undefined ? "__null__" : String(v));
  const fromKey = (k: string) => {
    const hit = options.find((o) => key(o[0]) === k);
    return hit ? hit[0] : null;
  };
  $effect(() => {
    // Keep the bound value valid when options change (Streamlit resets to the first option).
    if (options.length && !options.some((o) => key(o[0]) === key(value))) value = options[0][0];
  });
</script>

<div class="field">
  {#if label}<label for={name || undefined}>{label}</label>{/if}
  <select class="input" id={name || undefined} {name} {disabled} aria-label={label} value={key(value)} onchange={(e) => (value = fromKey((e.target as HTMLSelectElement).value))}>
    {#each options as [v, text]}
      <option value={key(v)} selected={key(v) === key(value)}>{text}</option>
    {/each}
  </select>
</div>
