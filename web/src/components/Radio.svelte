<script lang="ts">
  /** Horizontal radio group (st.radio). */
  let { label = "", options, value = $bindable(), horizontal = true, name = Math.random().toString(36).slice(2), collapsed = false }:
    { label?: string; options: string[]; value?: string; horizontal?: boolean; name?: string; collapsed?: boolean } = $props();
</script>

<div class="field" role="radiogroup" aria-label={label}>
  {#if label}<span class="label" class:sr-only={collapsed}>{label}</span>{/if}
  <div class="radio-group" class:vertical={!horizontal}>
    {#each options as opt}
      <label><input type="radio" {name} value={opt} bind:group={value} /> <span>{opt}</span></label>
    {/each}
  </div>
</div>
