<script lang="ts">
  import type { Snippet } from "svelte";
  /** st.info / st.success / st.warning / st.error. Use `html` or children. */
  let { kind = "info", html = "", children, preLine = false }:
    { kind?: "info" | "success" | "warning" | "error"; html?: string; children?: Snippet; preLine?: boolean } = $props();
  // Streamlit renders a leading emoji in its own element; doing the same keeps the sentence a separate text node.
  const body = $derived(html.replace(/^(\p{Extended_Pictographic}️?)\s*/u, '<span class="ico">$1</span> '));
</script>

<div class="alert {kind}" role={kind === "error" ? "alert" : "status"}>
  <div class="body" style={preLine ? "white-space: pre-line" : ""}>
    {#if children}{@render children()}{:else}{@html body}{/if}
  </div>
</div>
