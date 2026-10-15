<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { localizedText } from '../lib/strings.js';

  export let colorOptions = [];
  export let iconOptions = [];
  export let iconMap = {};
  export let selectedColor = '';
  export let noneLabel = '';

  const dispatch = createEventDispatcher();
</script>

<ModalShell
  title={$localizedText.sidebar.modals.iconColor}
  widthClass="w-[28rem]"
  on:close={() => dispatch('close')}
>
  <div class="mb-6">
    <fieldset>
      <legend class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.color}</legend>
      <div class="flex gap-2 flex-wrap">
        {#each colorOptions as c}
          <TooltipIconButton
            on:click={() => dispatch('color', c)}
            class="w-7 h-7 rounded-ui border-2 transition-[border-color,transform] {selectedColor === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent hover:scale-105'}"
            style="background: {c}"
            label={c}
            tooltip={c}
          ></TooltipIconButton>
        {/each}
      </div>
    </fieldset>
  </div>
  <div class="grid grid-cols-6 gap-3">
    <TooltipIconButton
      on:click={() => dispatch('icon', null)}
      class="w-full aspect-square flex items-center justify-center border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] transition text-[length:var(--text-whisper)] uppercase tracking-tighter opacity-50"
      label={noneLabel}
    >{noneLabel}</TooltipIconButton>
    {#each iconOptions as icon}
      <TooltipIconButton
        on:click={() => dispatch('icon', icon)}
        class="w-full aspect-square flex items-center justify-center hover:bg-[var(--border-subtle)] transition rounded-ui border border-transparent hover:border-[var(--border-subtle)]"
        label={icon}
        tooltip={icon}
      >
        {#if iconMap[icon]}
          <svelte:component this={iconMap[icon]} size="20" aria-hidden="true" />
        {/if}
      </TooltipIconButton>
    {/each}
  </div>
  <div class="mt-8">
    <button on:click={() => dispatch('close')} class="w-full text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
  </div>
</ModalShell>
