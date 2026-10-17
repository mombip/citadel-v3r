<script lang="ts">
  let { label, checked = $bindable(false), name = "" }: { label: string; checked?: boolean; name?: string } = $props();
</script>

<label class="checkbox"><input type="checkbox" {name} bind:checked /> <span>{label}</span></label>
