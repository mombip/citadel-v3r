<script lang="ts">
  /** KPI tile (port of render_bento_card). `value` may contain HTML. */
  let { title, value, sub = "", accent = "", style = "" }: { title: string; value: string; sub?: string; accent?: string; style?: string } = $props();
</script>

<div class="bento-card" data-testid="bento-card">
  <div class="bento-card-header">{title}</div>
  <div class="bento-card-value {accent}" {style}>{@html value}</div>
  <div class="bento-card-sub">{@html sub}</div>
</div>
