<script>
  /**
   * Asked once, on first launch: what this device is called. When notes sync between devices, this is
   * the name the others see on every version in a note's history and on each side of a conflict
   * ("Phone, today 14:35" rather than "the other version"). The field starts with the computer's own
   * name, so pressing Enter is enough; closing the dialog keeps that name too, so it is never asked twice.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { localizedText } from '../lib/strings.js';

  export let suggested = '';

  const dispatch = createEventDispatcher();
  let name = suggested;
  let saving = false;
  let error = '';
  let field;

  onMount(() => field?.select());

  async function save(value = name) {
    const chosen = String(value || '').trim() || suggested;
    if (!chosen || saving) return;
    saving = true;
    error = '';
    try {
      const response = await fetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: chosen }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
      dispatch('saved', body.name);
    } catch (failure) {
      error = $localizedText.deviceName.failed;
      console.error('Device name not saved:', failure);
    } finally {
      saving = false;
    }
  }
</script>

<ModalShell title={$localizedText.deviceName.title} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => save(suggested)}>
  <form on:submit|preventDefault={() => save()} data-testid="device-name-prompt">
    <p class="text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.deviceName.why}</p>
    <label for="first-device-name" class="mt-6 block text-xs text-[var(--text-secondary)]">{$localizedText.deviceName.label}</label>
    <input
      id="first-device-name"
      bind:this={field}
      bind:value={name}
      maxlength="40"
      autocomplete="off"
      placeholder={suggested}
      class="mt-1.5 {formFieldClass()}"
    />
    <p class="mt-2 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.deviceName.later}</p>
    {#if error}<p class="mt-2 text-xs text-[var(--red)]">{error}</p>{/if}
    <div class="mt-8 flex">
      <button type="submit" disabled={saving} class={getModalButtonClass('primary', { extraClass: 'py-2' })}>
        {$localizedText.deviceName.save}
      </button>
    </div>
  </form>
</ModalShell>
