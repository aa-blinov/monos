<script>
  import { createEventDispatcher } from 'svelte';
  import { Lock } from 'lucide-svelte';
  import { localizedText } from '../lib/strings.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { unlockNoteRequest } from '../lib/editor-api.js';

  // The screen a locked note shows instead of its text. Nothing of the note is loaded until it is unlocked.
  export let filePath = '';

  const dispatch = createEventDispatcher();

  let passphrase = '';
  let busy = false;
  let error = '';

  async function unlock() {
    if (!passphrase || busy) return;
    busy = true;
    error = '';
    try {
      await unlockNoteRequest(filePath, passphrase);
      passphrase = '';
      dispatch('unlocked');
    } catch (failure) {
      error = failure?.status === 403 ? $localizedText.lock.wrongPassphrase : $localizedText.lock.unlockFailed;
    } finally {
      busy = false;
    }
  }
</script>

<form class="w-full max-w-sm space-y-4 text-center" data-testid="locked-note" on:submit|preventDefault={unlock}>
  <Lock size="24" strokeWidth="1.7" aria-hidden="true" class="mx-auto text-[var(--text-secondary)]" />
  <h2 class="text-base font-bold text-[var(--text-primary)]">{$localizedText.lock.lockedTitle}</h2>
  <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.lock.lockedHint}</p>
  <input
    type="password"
    bind:value={passphrase}
    disabled={busy}
    autocomplete="off"
    placeholder={$localizedText.lock.passphrase}
    aria-label={$localizedText.lock.passphrase}
    class={formFieldClass({ extraClass: 'text-center' })}
  />
  <button
    type="submit"
    disabled={busy || !passphrase}
    class="rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
  >{$localizedText.lock.unlock}</button>
  {#if error}
    <p role="alert" class="text-xs text-[var(--red)]">{error}</p>
  {/if}
</form>
