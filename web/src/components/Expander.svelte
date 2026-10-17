<script lang="ts">
  import type { Snippet } from "svelte";
  /** st.expander */
  let { title, open = false, children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<details class="expander" {open}>
  <summary>{title}</summary>
  <div class="content">{@render children()}</div>
</details>
