<script>
  /**
   * Which agent the terminal starts ("Start the agent", "Ask the agent about this note"), and the rule files
   * that tell it how notes are written here. Desktop app only: elsewhere there is no terminal to run it in.
   */
  import { onMount } from 'svelte';
  import { Button } from '@monos/ui';
  import { formFieldClass } from '../lib/form-field.js';
  import { localizedText } from '../lib/strings.js';
  import { AGENT_PRESETS, DEFAULT_AGENT_COMMAND } from '../lib/terminal.js';

  let command = DEFAULT_AGENT_COMMAND;
  let custom = '';
  let choice = 'claude';
  let rules = null;
  let busy = false;

  onMount(async () => {
    try {
      const settings = await (await fetch('/api/settings')).json();
      command = String(settings?.agent_command || '').trim() || DEFAULT_AGENT_COMMAND;
    } catch { /* the default */ }
    const preset = AGENT_PRESETS.find((item) => item.command === command);
    choice = preset ? preset.id : 'custom';
    custom = preset ? '' : command;
    try { rules = await (await fetch('/api/agent/rules')).json(); } catch { rules = null; }
  });

  async function save(next) {
    const value = String(next || '').trim();
    if (!value || value === command) return;
    command = value;
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_command: value }) });
  }

  function pick(id) {
    choice = id;
    const preset = AGENT_PRESETS.find((item) => item.id === id);
    if (preset) void save(preset.command);
  }

  async function createRules() {
    busy = true;
    try {
      const answer = await (await fetch('/api/agent/rules', { method: 'POST' })).json();
      rules = answer.files;
    } finally {
      busy = false;
    }
  }

  $: rulesReady = Boolean(rules?.['AGENTS.md'] || rules?.['CLAUDE.md']);
</script>

<section class="space-y-5" data-testid="agent-section">
  <div>
    <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.agent.title}</h2>
    <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.agent.hint}</p>
  </div>
  <div class="flex flex-wrap gap-2" role="radiogroup" aria-label={$localizedText.agent.which}>
    {#each AGENT_PRESETS as preset (preset.id)}
      <Button variant="ghost" size="sm"
        type="button"
        role="radio"
        aria-checked={choice === preset.id}
        on:click={() => pick(preset.id)}
        class="rounded-ui border px-3 py-1.5 text-xs transition {choice === preset.id ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
      >{preset.label} <span class="font-mono text-[var(--text-tertiary)]">{preset.command}</span></Button>
    {/each}
    <Button variant="ghost" size="sm"
      type="button"
      role="radio"
      aria-checked={choice === 'custom'}
      on:click={() => { choice = 'custom'; }}
      class="rounded-ui border px-3 py-1.5 text-xs transition {choice === 'custom' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
    >{$localizedText.agent.other}</Button>
  </div>
  {#if choice === 'custom'}
    <div>
      <label for="agent-command" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.agent.command}</label>
      <input id="agent-command" type="text" bind:value={custom} on:change={() => save(custom)} placeholder="aider --model sonnet" class="font-mono {formFieldClass()}" />
    </div>
  {/if}
  <div class="flex flex-wrap items-baseline gap-x-5 gap-y-2">
    <p class="text-xs text-[var(--text-secondary)]" data-testid="agent-rules-status">
      {rulesReady ? $localizedText.agent.rulesReady : $localizedText.agent.rulesMissing}
    </p>
    {#if !rulesReady}
      <Button variant="ghost" size="md" type="button" disabled={busy} on:click={createRules} class="min-h-6 text-xs font-bold max-sm:min-h-11 uppercase tracking-widest text-[var(--text-primary)] transition enabled:hover:opacity-70 disabled:opacity-30">{$localizedText.terminal.rulesCreate}</Button>
    {/if}
  </div>
</section>
