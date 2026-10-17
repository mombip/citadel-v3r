<script lang="ts">
  /** Numeric input with −/+ steppers (st.number_input look). */
  let {
    value = $bindable(0), min = -Infinity, max = Infinity, step = 1, label = "", disabled = false, name = "",
  }: { value?: number; min?: number; max?: number; step?: number; label?: string; disabled?: boolean; name?: string } = $props();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const decimals = $derived(String(step).includes(".") ? String(step).split(".")[1].length : 0);
  const bump = (dir: number) => (value = Number(clamp((Number(value) || 0) + dir * step).toFixed(Math.max(decimals, 2))));
  const onInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(",", ".");
    const n = Number(raw);
    if (!isNaN(n) && raw !== "") value = n;
  };
</script>

<div class="field">
  {#if label}<label for={name || undefined}>{label}</label>{/if}
  <div class="num-wrap">
    <input class="input" type="number" id={name || undefined} {name} value={value} {min} {max} step="any" {disabled} oninput={onInput} onblur={() => (value = clamp(Number(value) || 0))} aria-label={label} />
    <button type="button" tabindex="-1" {disabled} onclick={() => bump(-1)} aria-label="−">−</button>
    <button type="button" tabindex="-1" {disabled} onclick={() => bump(1)} aria-label="+">+</button>
  </div>
</div>
