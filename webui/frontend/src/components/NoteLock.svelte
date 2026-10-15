<script>
  import { createEventDispatcher } from 'svelte';
  import { localizedText } from '../lib/strings.js';
  import { flushOpenNote } from '../lib/note-refresh.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { lockNoteRequest, relockNoteRequest, unprotectNoteRequest } from '../lib/editor-api.js';

  // Locking controls of the open note: seal it with a passphrase, close it again, or remove the lock.
  export let filePath = '';
  export let locked = false;
  export let unlocked = false;

  const dispatch = createEventDispatcher();

  let passphrase = '';
  let repeat = '';
  let busy = false;
  let error = '';

  // Pending typing is saved first, so the next autosave cannot undo the change made here.
  async function run(action) {
    error = '';
    busy = true;
    try {
      await flushOpenNote();
      await action();
      dispatch('changed');
      return true;
    } catch (failure) {
      console.error('Lock action failed:', failure);
      error = failure?.status === 403 ? $localizedText.lock.wrongPassphrase : $localizedText.lock.actionFailed;
      return false;
    } finally {
      busy = false;
    }
  }

  async function lock() {
    if (!passphrase) {
      error = $localizedText.lock.passphraseRequired;
      return;
    }
    if (passphrase !== repeat) {
      error = $localizedText.lock.passphraseMismatch;
      return;
    }
    if (await run(() => lockNoteRequest(filePath, passphrase))) {
      passphrase = '';
      repeat = '';
    }
  }

  async function removeLock() {
    if (!passphrase) {
      error = $localizedText.lock.passphraseRequired;
      return;
    }
    if (await run(() => unprotectNoteRequest(filePath, passphrase))) passphrase = '';
  }

  function relock() {
    run(() => relockNoteRequest(filePath));
  }
</script>

<section class="space-y-2 border-t border-[var(--border-subtle)] pt-3" data-testid="note-lock">
  <p class="mb-2 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{$localizedText.lock.title}</p>
  {#if !locked}
    <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.lock.lockHint}</p>
    <input
      type="password"
      bind:value={passphrase}
      disabled={busy}
      autocomplete="new-password"
      placeholder={$localizedText.lock.passphrase}
      aria-label={$localizedText.lock.passphrase}
      class={formFieldClass({ extraClass: 'w-full' })}
    />
    <input
      type="password"
      bind:value={repeat}
      disabled={busy}
      autocomplete="new-password"
      placeholder={$localizedText.lock.repeatPassphrase}
      aria-label={$localizedText.lock.repeatPassphrase}
      class={formFieldClass({ extraClass: 'w-full' })}
    />
    <button
      type="button"
      disabled={busy}
      on:click={lock}
      class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
    >{$localizedText.lock.lockButton}</button>
  {:else if unlocked}
    <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.lock.openForSession}</p>
    <button
      type="button"
      disabled={busy}
      on:click={relock}
      class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
    >{$localizedText.lock.relock}</button>
    <input
      type="password"
      bind:value={passphrase}
      disabled={busy}
      autocomplete="off"
      placeholder={$localizedText.lock.passphrase}
      aria-label={$localizedText.lock.passphrase}
      class={formFieldClass({ extraClass: 'w-full' })}
    />
    <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.lock.removeLockHint}</p>
    <button
      type="button"
      disabled={busy}
      on:click={removeLock}
      class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
    >{$localizedText.lock.removeLock}</button>
  {/if}
  {#if error}
    <p role="alert" class="text-xs text-[var(--red)]">{error}</p>
  {/if}
</section>
