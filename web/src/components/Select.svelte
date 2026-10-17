<script lang="ts">
  /**
   * st.selectbox: a searchable combobox. Typing filters options fuzzily like Streamlit
   * ("Mati" finds "Mateusz Kowalski"), ignoring case and Polish diacritics.
   * Options are [value, label] pairs; the bound value is the option value.
   */
  import { fuzzyFilter } from "../../../shared/fuzzy";

  let { label = "", options, value = $bindable(), disabled = false, name = "", collapsed = false }:
    { label?: string; options: [any, string][]; value?: any; disabled?: boolean; name?: string; collapsed?: boolean } = $props();

  const uid = Math.random().toString(36).slice(2, 8);
  const inputId = $derived(name || `sel-${uid}`);
  const listId = $derived(`${inputId}-list`);
  const key = (v: any) => (v === null || v === undefined ? "__null__" : String(v));

  let open = $state(false);
  let query = $state("");
  let active = $state(0);
  let input: HTMLInputElement;
  let list = $state<HTMLUListElement>();

  const selected = $derived(options.find((o) => key(o[0]) === key(value)));
  const filtered = $derived(fuzzyFilter(options, query, (o) => o[1]));

  $effect(() => {
    // Keep the bound value valid when options change (Streamlit resets to the first option).
    if (options.length && !options.some((o) => key(o[0]) === key(value))) value = options[0][0];
  });

  function show() {
    if (disabled || open) return;
    query = "";
    open = true;
    active = Math.max(0, options.findIndex((o) => key(o[0]) === key(value)));
    queueMicrotask(() => input?.select());
    scrollActive();
  }

  function choose(option: [any, string]) {
    value = option[0];
    close();
  }

  function close() {
    open = false;
    query = "";
  }

  function scrollActive() {
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  function onKey(e: KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      show();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(filtered.length - 1, active + 1); scrollActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); scrollActive(); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close();
  }
</script>

<div class="field">
  {#if label}<label for={inputId} class:sr-only={collapsed}>{label}</label>{/if}
  <div class="combo" class:open>
    <input
      bind:this={input}
      class="input combo-input"
      id={inputId}
      name={name || undefined}
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-label={label}
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
      {disabled}
      value={open ? query : (selected?.[1] ?? "")}
      placeholder={open ? (selected?.[1] ?? "") : ""}
      onfocus={show}
      onclick={show}
      oninput={(e) => { query = (e.target as HTMLInputElement).value; active = 0; open = true; }}
      onkeydown={onKey}
      onblur={() => setTimeout(close, 120)}
    />
    {#if open}
      <ul class="combo-list" role="listbox" id={listId} bind:this={list} aria-label={label}>
        {#each filtered as option, i (key(option[0]))}
          <li
            id={`${listId}-${i}`}
            role="option"
            data-index={i}
            aria-selected={key(option[0]) === key(value)}
            class:active={i === active}
            onmousedown={(e) => { e.preventDefault(); choose(option); }}
            onmousemove={() => (active = i)}
          >{option[1]}</li>
        {:else}
          <li class="combo-empty" role="presentation">Brak wyników</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .combo { position: relative; }
  .combo-input {
    padding-right: 2.2rem;
    cursor: pointer;
    text-overflow: ellipsis;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.8rem center;
  }
  .open .combo-input { cursor: text; }
  :global(:root[data-theme="light_mono"]) .combo-input {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  }
  .combo-input:disabled { cursor: not-allowed; }
  .combo-list {
    position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px 0; list-style: none;
    max-height: 300px; overflow-y: auto; background: var(--input-bg); border: 1px solid var(--input-border);
    border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  }
  .combo-list li { padding: 8px 12px; cursor: pointer; color: var(--input-text); font-size: 0.95rem; }
  .combo-list li[aria-selected="true"] { font-weight: 600; }
  .combo-list li.active { background: color-mix(in srgb, var(--input-focus) 22%, transparent); }
  .combo-list .combo-empty { cursor: default; color: var(--text-muted); }
</style>
