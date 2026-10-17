<script lang="ts">
  /**
   * Numeric input with −/+ steppers (st.number_input look).
   * Like Streamlit, float fields display two decimals and integer fields none (`decimals={0}`);
   * the text is only re-formatted when the field is not being edited.
   */
  let {
    value = $bindable(0), min = -Infinity, max = Infinity, step = 1, label = "", disabled = false, name = "", decimals = 2,
  }: { value?: number; min?: number; max?: number; step?: number; label?: string; disabled?: boolean; name?: string; decimals?: number } = $props();

  let input: HTMLInputElement;
  let display = $state("");
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const format = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : "");

  $effect(() => {
    // External value changes (defaults, resets) refresh the text unless the user is typing in the field.
    const v = value;
    if (document.activeElement !== input) display = format(v);
  });

  const bump = (dir: number) => {
    value = Number(clamp((Number(value) || 0) + dir * step).toFixed(Math.max(decimals, 2)));
    display = format(value);
  };
  const onInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(",", ".");
    display = raw;
    const n = Number(raw);
    if (!isNaN(n) && raw !== "") value = n;
  };
  const onBlur = () => {
    value = clamp(Number(String(display).replace(",", ".")) || 0);
    display = format(value);
  };
</script>

<div class="field">
  {#if label}<label for={name || undefined}>{label}</label>{/if}
  <div class="num-wrap">
    <input class="input" type="number" id={name || undefined} {name} bind:this={input} value={display} {min} {max} step="any" {disabled} oninput={onInput} onblur={onBlur} aria-label={label} />
    <button type="button" tabindex="-1" {disabled} onclick={() => bump(-1)} aria-label="−">−</button>
    <button type="button" tabindex="-1" {disabled} onclick={() => bump(1)} aria-label="+">+</button>
  </div>
</div>
