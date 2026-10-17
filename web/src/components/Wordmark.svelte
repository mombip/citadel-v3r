<script lang="ts">
  /**
   * "Citadel for NG" in the brand lettering (Noto Serif Italic as paths) with a yellow dot over the "i".
   * `stacked`: two lines as in the original proposal — "Citadel" large, "for NG" smaller underneath.
   */
  import { WORDMARK, WORDMARK_STACKED } from "../lib/wordmark";
  let { height = 32, stacked = false }: { height?: number; stacked?: boolean } = $props();
  const mark = $derived(stacked ? WORDMARK_STACKED : WORDMARK);
</script>

<span class="sr-only">Citadel for NG</span>
<svg class="wordmark" viewBox={mark.viewBox} style="height: {height}px" aria-hidden="true">
  <path fill="currentColor" d={mark.d} />
  <circle cx={mark.dot.cx} cy={mark.dot.cy} r={mark.dot.r} fill={mark.dotColor} />
</svg>

<style>
  .wordmark { display: block; width: auto; max-width: 100%; overflow: visible; }
</style>
