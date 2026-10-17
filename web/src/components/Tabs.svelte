<script lang="ts">
  /** Pill tabs (port of st.tabs styling). Parent renders the content for `active`. */
  let { labels, active = $bindable(0), testid = "tabs" }: { labels: string[]; active?: number; testid?: string } = $props();
  $effect(() => {
    if (active >= labels.length) active = 0;
  });
</script>

<div class="tabs" role="tablist" data-testid={testid}>
  {#each labels as label, i}
    <button type="button" role="tab" aria-selected={i === active} onclick={() => (active = i)}>{label}</button>
  {/each}
</div>
