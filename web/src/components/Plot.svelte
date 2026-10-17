<script lang="ts">
  import { onMount } from "svelte";
  import { PLOTLY_CONFIG, type Figure } from "../lib/charts";
  /** Plotly chart host; re-renders whenever the figure changes. */
  let { figure }: { figure: Figure | null } = $props();
  let el: HTMLDivElement;
  let plotly = $state<any>(null);

  onMount(() => {
    import("plotly.js-basic-dist-min").then((m) => (plotly = m.default));
    return () => plotly?.purge(el);
  });

  $effect(() => {
    const f = figure;
    if (!plotly || !el) return;
    if (!f || !f.data.length) {
      plotly.purge(el);
      return;
    }
    plotly.react(el, f.data, { autosize: true, ...f.layout }, PLOTLY_CONFIG);
  });
</script>

<div class="plot" bind:this={el} data-testid="plot" style="height:{figure?.layout?.height ? figure.layout.height + 'px' : '360px'}"></div>
