<script>
  /**
   * The agent terminal: a real shell of this device, opened in its notes folder, docked under the note.
   * Run an agent here (claude, codex…) and its edits show in the notes above as it makes them (the backend
   * watches the folder). Hiding the panel keeps the shell running, so an agent can go on working.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import '@xterm/xterm/css/xterm.css';
  import { RotateCcw, X } from 'lucide-svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { activeTheme, themeMode } from '../stores.js';
  import { localizedText } from '../lib/strings.js';
  import { Bot } from 'lucide-svelte';
  import {
    agentLabel,
    agentRequest,
    clampTerminalHeight,
    DEFAULT_AGENT_COMMAND,
    noteQuestion,
    shellInForeground,
    terminalBridge,
    terminalOpen,
    terminalTheme,
  } from '../lib/terminal.js';

  const HEIGHT_KEY = 'monos.terminalHeight';

  let host;
  let term = null;
  let fit = null;
  let sessionId = null;
  let starting = false;
  let exited = false;
  let folder = '';
  let agentCommand = DEFAULT_AGENT_COMMAND;
  // Whether the notes folder has the files that tell an agent how to work in it (AGENTS.md, CLAUDE.md).
  let rulesMissing = false;
  let firstOutput = null;
  let height = clampTerminalHeight(readHeight(), typeof window === 'undefined' ? 900 : window.innerHeight);
  const unsubscribe = [];

  function readHeight() {
    try { return Number(localStorage.getItem(HEIGHT_KEY)); } catch { return NaN; }
  }

  function themeNow() {
    const style = getComputedStyle(document.documentElement);
    return terminalTheme((name) => style.getPropertyValue(name));
  }

  function fitNow() {
    if (!term || !fit || !host?.offsetWidth) return;
    try { fit.fit(); } catch { /* hidden */ }
  }

  async function startSession() {
    if (!term || starting) return;
    starting = true;
    exited = false;
    try {
      firstOutput = new Promise((resolve) => { resolveFirstOutput = resolve; });
      const session = await terminalBridge.create({ cols: term.cols, rows: term.rows });
      sessionId = session.id;
      folder = session.cwd;
    } catch (error) {
      term.writeln(`\r\n${$localizedText.terminal.startFailed}: ${error?.message || error}`);
      exited = true;
    } finally {
      starting = false;
    }
  }

  function restart() {
    if (sessionId !== null && !exited) terminalBridge.kill(sessionId);
    sessionId = null;
    term?.reset();
    void startSession();
  }

  onMount(() => {
    if (!terminalBridge) return;
    term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: false,
      theme: themeNow(),
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    // Links in the output open in the system browser (the window refuses to navigate away).
    term.loadAddon(new WebLinksAddon((_event, url) => window.open(url, '_blank', 'noopener')));
    term.open(host);
    term.onData((data) => {
      if (sessionId !== null && !exited) terminalBridge.write(sessionId, data);
    });
    term.onResize(({ cols, rows }) => {
      if (sessionId !== null && !exited) terminalBridge.resize(sessionId, cols, rows);
    });
    unsubscribe.push(terminalBridge.onData((id, data) => {
      if (id !== sessionId) return;
      term.write(data);
      resolveFirstOutput?.();
      resolveFirstOutput = null;
    }));
    unsubscribe.push(terminalBridge.onExit((id, code) => {
      if (id !== sessionId) return;
      exited = true;
      term.writeln(`\r\n${$localizedText.terminal.exited(code)}`);
    }));
    const observer = new ResizeObserver(() => fitNow());
    observer.observe(host);
    unsubscribe.push(() => observer.disconnect());
    // The theme sets its colours on the page; the terminal takes them once they are there.
    const retheme = () => setTimeout(() => { if (term) term.options.theme = themeNow(); }, 0);
    unsubscribe.push(activeTheme.subscribe(retheme), themeMode.subscribe(retheme));
  });

  // The shell starts the first time the panel opens, and the keyboard goes to it whenever it opens.
  $: if ($terminalOpen && term) {
    tick().then(() => {
      fitNow();
      if (sessionId === null && !starting && !exited) void startSession();
      term.focus();
    });
  }

  let resolveFirstOutput = null;

  async function loadAgentSettings() {
    try {
      const settings = await (await fetch('/api/settings')).json();
      agentCommand = String(settings?.agent_command || '').trim() || DEFAULT_AGENT_COMMAND;
    } catch { /* the default stays */ }
    try {
      const rules = await (await fetch('/api/agent/rules')).json();
      rulesMissing = !rules?.['AGENTS.md'] && !rules?.['CLAUDE.md'];
    } catch {
      rulesMissing = false;
    }
  }
  $: if ($terminalOpen) void loadAgentSettings();

  async function createRules() {
    try {
      await fetch('/api/agent/rules', { method: 'POST' });
      rulesMissing = false;
    } catch { /* stays offered */ }
  }

  /**
   * "Start the agent" and "Ask the agent about this note". With the shell in front the agent is started (with
   * the question, the cursor left inside it); with the agent already running, the words go into its input.
   */
  async function handleAgentRequest(request) {
    if (!request || !term) return;
    agentRequest.set(null);
    terminalOpen.set(true);
    await tick();
    fitNow();
    if (sessionId === null || exited) {
      sessionId = null;
      exited = false;
      await startSession();
    }
    // A fresh shell reads its profile first; what is typed before its prompt would be lost.
    await Promise.race([firstOutput, new Promise((resolve) => setTimeout(resolve, 1500))]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await loadAgentSettings();
    const inShell = shellInForeground(await terminalBridge.process(sessionId));
    if (request.kind === 'launch') {
      if (inShell) terminalBridge.write(sessionId, `${agentCommand}\r`);
    } else {
      const question = noteQuestion(request.notePath, $localizedText.terminal.aboutNote);
      if (inShell) terminalBridge.write(sessionId, `${question.commandLine(agentCommand)}\x1b[D`);
      else terminalBridge.write(sessionId, question.prompt);
    }
    term.focus();
  }
  $: if ($agentRequest && term) void handleAgentRequest($agentRequest);

  onDestroy(() => {
    unsubscribe.forEach((stop) => stop());
    if (sessionId !== null && !exited) terminalBridge?.kill(sessionId);
    term?.dispose();
  });

  // Dragging the top edge sets the height; double-click returns it to the default.
  function startResize(event) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const move = (e) => { height = clampTerminalHeight(startHeight + (startY - e.clientY), window.innerHeight); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem(HEIGHT_KEY, String(height)); } catch { /* private window */ }
      fitNow();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function resetHeight() {
    height = clampTerminalHeight(undefined, window.innerHeight);
    try { localStorage.removeItem(HEIGHT_KEY); } catch { /* private window */ }
  }
</script>

{#if terminalBridge}
  <section
    class="relative flex shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]"
    class:hidden={!$terminalOpen}
    style="height: {height}px"
    data-testid="terminal-panel"
    aria-label={$localizedText.terminal.title}
  >
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
      on:pointerdown={startResize}
      on:dblclick={resetHeight}
      title={$localizedText.terminal.resize}
    ></div>
    <header class="flex h-8 shrink-0 items-center gap-3 px-3 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
      <span class="font-bold text-[var(--text-secondary)]">{$localizedText.terminal.title}</span>
      {#if folder}<span class="truncate normal-case tracking-normal">{folder}</span>{/if}
      {#if rulesMissing}
        <button type="button" data-testid="agent-rules-create" on:click={createRules} class="normal-case tracking-normal text-[var(--text-secondary)] underline decoration-[var(--border-subtle)] underline-offset-4 transition hover:text-[var(--text-primary)]" title={$localizedText.terminal.rulesHint}>{$localizedText.terminal.rulesCreate}</button>
      {/if}
      <span class="ml-auto hidden normal-case tracking-normal sm:inline">{$localizedText.terminal.shortcut}</span>
      <button
        type="button"
        data-testid="agent-launch"
        on:click={() => agentRequest.set({ kind: 'launch', at: Date.now() })}
        class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
      >
        <Bot size="14" strokeWidth="1.7" aria-hidden="true" />{$localizedText.terminal.launch(agentLabel(agentCommand))}
      </button>
      <TooltipIconButton
        class="h-7 w-7 rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
        label={$localizedText.terminal.restart}
        tooltip={$localizedText.terminal.restart}
        tooltipAlign="end"
        on:click={restart}
      >
        <RotateCcw size="14" strokeWidth="1.7" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        class="h-7 w-7 rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
        label={$localizedText.terminal.hide}
        tooltip={$localizedText.terminal.hide}
        tooltipAlign="end"
        on:click={() => terminalOpen.set(false)}
      >
        <X size="14" strokeWidth="1.7" aria-hidden="true" />
      </TooltipIconButton>
    </header>
    <div class="min-h-0 flex-1 px-3 pb-2" bind:this={host} data-testid="terminal-host"></div>
  </section>
{/if}

<style>
  /* xterm's own scrollbar track would be a grey stripe on the theme's background. */
  :global([data-testid="terminal-host"] .xterm-viewport) { background-color: transparent !important; }
  :global([data-testid="terminal-host"] .xterm) { height: 100%; }
</style>
