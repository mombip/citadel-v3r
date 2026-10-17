<script lang="ts">
  /** "Citadel for NG" in the brand lettering (Noto Serif Italic as paths) with a yellow dot over the "i". */
  import { WORDMARK } from "../lib/wordmark";
  let { height = 32 }: { height?: number } = $props();
</script>

<svg class="wordmark" viewBox={WORDMARK.viewBox} style="height: {height}px" role="img" aria-label="Citadel for NG">
  <path fill="currentColor" d={WORDMARK.d} />
  <circle cx={WORDMARK.dot.cx} cy={WORDMARK.dot.cy} r={WORDMARK.dot.r} fill={WORDMARK.dotColor} />
</svg>

<style>
  .wordmark { display: block; width: auto; max-width: 100%; overflow: visible; }
</style>
