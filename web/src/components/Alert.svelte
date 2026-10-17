<script lang="ts">
  import type { Snippet } from "svelte";
  /** st.info / st.success / st.warning / st.error. Use `html` or children. */
  let { kind = "info", html = "", children }: { kind?: "info" | "success" | "warning" | "error"; html?: string; children?: Snippet } = $props();
</script>

<div class="alert {kind}" role={kind === "error" ? "alert" : "status"}>
  <div class="body">
    {#if children}{@render children()}{:else}{@html html}{/if}
  </div>
</div>
