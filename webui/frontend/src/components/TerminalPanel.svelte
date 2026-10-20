<script>
  /**
   * The agent terminal: real shells of this device, opened in its notes folder, docked under the note.
   * Run an agent here (claude, codex…) and its edits show in the notes above as it makes them (the backend
   * watches the folder). Hiding the panel keeps the shells running, so an agent can go on working.
   *
   * Several tabs, each its own shell; ⌘F searches the visible one; a note path in the output opens the note.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { SearchAddon } from '@xterm/addon-search';
  import '@xterm/xterm/css/xterm.css';
  import { SEARCH_BUTTON_COMPACT_CLASS, SEARCH_ICON_COMPACT_CLASS, SEARCH_INPUT_COMPACT_CLASS } from '../lib/search-field.js';
  import { Bot, ChevronDown, ChevronUp, MoreHorizontal, Plus, RotateCcw, Search, X } from 'lucide-svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { activeTheme, themeMode } from '../stores.js';
  import { localizedText } from '../lib/strings.js';
  import { agentReview, agentReviewOpen, ensureAgentCheckpoint, refreshAgentReview } from '../lib/agent-review.js';
  import { findNoteLinks, notePathsOf } from '../lib/terminal-links.js';
  import { computeContextMenuPosition } from '../lib/context-menu-position.js';
  import { NOTES_PULLED_EVENT } from '../lib/note-refresh.js';
  import {
    agentLabel,
    agentRequest,
    clampTerminalHeight,
    storedTerminalHeight,
    DEFAULT_AGENT_COMMAND,
    noteLinkRequest,
    noteQuestion,
    shellInForeground,
    terminalBridge,
    terminalOpen,
    terminalTheme,
  } from '../lib/terminal.js';

  const HEIGHT_KEY = 'monos.terminalHeight';
  const MAX_TABS = 6;

  /** @type {Array<{ key: number, sessionId: number|null, term: any, fit: any, search: any, host: HTMLElement|null, exited: boolean, starting: boolean, title: string, firstOutput: Promise<void>|null, resolveFirst: (() => void)|null }>} */
  let tabs = [];
  let activeKey = null;
  let nextKey = 1;
  let folder = '';
  let root = '';
  let agentCommand = DEFAULT_AGENT_COMMAND;
  // Whether the notes folder has the files that tell an agent how to work in it (AGENTS.md, CLAUDE.md).
  let rulesMissing = false;
  let knownNotes = new Set();
  let searchOpen = false;
  let searchQuery = '';
  let searchInput;
  let height = clampTerminalHeight(readHeight(), typeof window === 'undefined' ? 900 : window.innerHeight);
  const unsubscribe = [];

  $: active = tabs.find((tab) => tab.key === activeKey) || null;

  function readHeight() {
    // Nothing stored is "no height", not 0: Number(null) is 0, which opened every new terminal at the minimum.
    try { return storedTerminalHeight(localStorage.getItem(HEIGHT_KEY)); } catch { return NaN; }
  }

  function themeNow() {
    const style = getComputedStyle(document.documentElement);
    return terminalTheme((name) => style.getPropertyValue(name));
  }

  function fitTab(tab) {
    if (!tab?.term || !tab.fit || !tab.host?.offsetWidth) return;
    try { tab.fit.fit(); } catch { /* hidden */ }
  }

  // Правый клик в терминале: своё меню, как в системном терминале. Меню браузера в приложении не появляется.
  let termMenu = { show: false, x: 0, y: 0, canCopy: false };
  let termMenuEl;
  let termMenuPos = { x: 0, y: 0 };

  function openTermMenu(event) {
    event.preventDefault();
    termMenu = { show: true, x: event.clientX, y: event.clientY, canCopy: Boolean(active?.term?.getSelection?.()) };
    void tick().then(() => {
      const rect = termMenuEl?.getBoundingClientRect();
      termMenuPos = computeContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
        menuWidth: rect?.width || 0,
        menuHeight: rect?.height || 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      // The menu takes the focus, so the arrows and Esc reach it.
      termMenuEl?.focus({ preventScroll: true });
    });
  }

  function closeTermMenu() {
    termMenu = { show: false, x: 0, y: 0, canCopy: false };
    // The caret goes back to the shell.
    active?.term?.focus?.();
  }

  function handleTermMenuKeys(event) {
    const items = [...(termMenuEl?.querySelectorAll('[role="menuitem"]') ?? [])].filter((item) => !item.disabled);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeTermMenu();
    }
  }

  async function copySelection() {
    const text = active?.term?.getSelection?.() || '';
    closeTermMenu();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* the clipboard may be closed */ }
  }

  async function pasteClipboard() {
    closeTermMenu();
    try {
      const text = await navigator.clipboard.readText();
      if (text) active?.term?.paste?.(text);
    } catch { /* the clipboard may be closed */ }
  }

  function selectAllOutput() {
    closeTermMenu();
    active?.term?.selectAll?.();
  }

  async function loadKnownNotes() {
    try { knownNotes = notePathsOf(await (await fetch('/api/tree')).json()); } catch { /* links stay as they were */ }
  }

  // The xterm for a tab, created when its element is in the page.
  function mountTerm(host, tab) {
    tab.host = host;
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      theme: themeNow(),
    });
    tab.fit = new FitAddon();
    tab.search = new SearchAddon();
    term.loadAddon(tab.fit);
    term.loadAddon(tab.search);
    // Web links open in the system browser (the window refuses to navigate away).
    term.loadAddon(new WebLinksAddon((_event, url) => window.open(url, '_blank', 'noopener')));
    // Note paths open the note.
    term.registerLinkProvider({
      provideLinks(y, callback) {
        const line = term.buffer.active.getLine(y - 1)?.translateToString(true) || '';
        const links = findNoteLinks(line, knownNotes, root).map((link) => ({
          range: { start: { x: link.start + 1, y }, end: { x: link.end, y } },
          text: line.slice(link.start, link.end),
          decorations: { underline: true, pointerCursor: true },
          activate: () => noteLinkRequest.set({ path: link.path, at: Date.now() }),
        }));
        callback(links.length ? links : undefined);
      },
    });
    // ⌘F / Ctrl+F searches the terminal instead of reaching the shell.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        void openSearch();
        return false;
      }
      return true;
    });
    term.open(host);
    term.onData((data) => {
      if (tab.sessionId !== null && !tab.exited) terminalBridge.write(tab.sessionId, data);
    });
    term.onResize(({ cols, rows }) => {
      if (tab.sessionId !== null && !tab.exited) terminalBridge.resize(tab.sessionId, cols, rows);
    });
    tab.term = term;
    const observer = new ResizeObserver(() => fitTab(tab));
    observer.observe(host);
    tick().then(() => {
      fitTab(tab);
      void startSession(tab);
      if (tab.key === activeKey) term.focus();
    });
    return { destroy: () => observer.disconnect() };
  }

  async function startSession(tab) {
    if (!tab.term || tab.starting) return;
    tab.starting = true;
    tab.exited = false;
    try {
      tab.firstOutput = new Promise((resolve) => { tab.resolveFirst = resolve; });
      const session = await terminalBridge.create({ cols: tab.term.cols, rows: tab.term.rows });
      tab.sessionId = session.id;
      folder = session.cwd;
      root = session.root || '';
      // From here on, files changed outside Monos are compared with how they are now.
      void ensureAgentCheckpoint().then(refreshAgentReview);
    } catch (error) {
      tab.term.writeln(`\r\n${$localizedText.terminal.startFailed}: ${error?.message || error}`);
      tab.exited = true;
    } finally {
      tab.starting = false;
      tabs = tabs;
    }
  }

  function newTab() {
    if (tabs.length >= MAX_TABS) return null;
    const tab = { key: nextKey++, sessionId: null, term: null, fit: null, search: null, host: null, exited: false, starting: false, title: '', firstOutput: null, resolveFirst: null };
    tabs = [...tabs, tab];
    activeKey = tab.key;
    return tab;
  }

  async function activate(key) {
    activeKey = key;
    await tick();
    const tab = tabs.find((item) => item.key === key);
    fitTab(tab);
    tab?.term?.focus();
  }

  function closeTab(key) {
    const tab = tabs.find((item) => item.key === key);
    if (!tab) return;
    if (tab.sessionId !== null && !tab.exited) terminalBridge.kill(tab.sessionId);
    tab.term?.dispose();
    const index = tabs.indexOf(tab);
    tabs = tabs.filter((item) => item !== tab);
    if (activeKey === key) {
      const next = tabs[Math.min(index, tabs.length - 1)];
      if (next) void activate(next.key);
      else {
        activeKey = null;
        terminalOpen.set(false);
      }
    }
  }

  function restart() {
    const tab = active;
    if (!tab?.term) return;
    if (tab.sessionId !== null && !tab.exited) terminalBridge.kill(tab.sessionId);
    tab.sessionId = null;
    tab.title = '';
    tab.term.reset();
    void startSession(tab);
  }

  // The first time the panel opens there is no tab yet; opening it again shows the tabs that are running.
  $: if ($terminalOpen && terminalBridge) {
    if (!tabs.length) newTab();
    else tick().then(() => { fitTab(active); active?.term?.focus(); });
  }

  async function openSearch() {
    searchOpen = true;
    await tick();
    searchInput?.focus();
    searchInput?.select();
  }

  function closeSearch() {
    searchOpen = false;
    active?.search?.clearDecorations();
    active?.term?.focus();
  }

  const searchOptions = () => {
    const style = getComputedStyle(document.documentElement);
    const mark = style.getPropertyValue('--yellow').trim() || '#d79921';
    return { caseSensitive: false, decorations: { matchBackground: `${mark}55`, activeMatchBackground: `${mark}aa`, matchOverviewRuler: mark, activeMatchColorOverviewRuler: mark } };
  };

  function findNext(backwards = false) {
    if (!active?.search || !searchQuery) return;
    if (backwards) active.search.findPrevious(searchQuery, searchOptions());
    else active.search.findNext(searchQuery, searchOptions());
  }

  function searchKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNext(event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  }

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
  $: if ($terminalOpen) {
    void loadAgentSettings();
    void loadKnownNotes();
  }

  async function createRules() {
    try {
      await fetch('/api/agent/rules', { method: 'POST' });
      rulesMissing = false;
    } catch { /* stays offered */ }
  }

  /**
   * "Start the agent" and "Ask the agent about this note", in the tab on screen. With the shell in front the
   * agent is started (with the question, the cursor left inside it); with the agent already running, the
   * words go into its input.
   */
  async function handleAgentRequest(request) {
    if (!request) return;
    agentRequest.set(null);
    terminalOpen.set(true);
    await tick();
    let tab = active || newTab();
    await tick();
    // A brand-new tab mounts its xterm and starts its shell first.
    for (let i = 0; i < 50 && (!tab.term || tab.sessionId === null) && !tab.exited; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      tab = tabs.find((item) => item.key === tab.key) || tab;
    }
    if (tab.sessionId === null || tab.exited) return;
    // A fresh shell reads its profile first; what is typed before its prompt would be lost.
    await Promise.race([tab.firstOutput, new Promise((resolve) => setTimeout(resolve, 1500))]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await loadAgentSettings();
    const inShell = shellInForeground(await terminalBridge.process(tab.sessionId));
    if (request.kind === 'launch') {
      if (inShell) terminalBridge.write(tab.sessionId, `${agentCommand}\r`);
    } else {
      const question = noteQuestion(request.notePath, $localizedText.terminal.aboutNote);
      if (inShell) terminalBridge.write(tab.sessionId, `${question.commandLine(agentCommand)}\x1b[D`);
      else terminalBridge.write(tab.sessionId, question.prompt);
    }
    if (inShell) {
      tab.title = agentLabel(agentCommand);
      tabs = tabs;
    }
    tab.term.focus();
  }
  $: if ($agentRequest) void handleAgentRequest($agentRequest);

  onMount(() => {
    if (!terminalBridge) return;
    unsubscribe.push(terminalBridge.onData((id, data) => {
      const tab = tabs.find((item) => item.sessionId === id);
      if (!tab) return;
      tab.term.write(data);
      tab.resolveFirst?.();
      tab.resolveFirst = null;
    }));
    unsubscribe.push(terminalBridge.onExit((id, code) => {
      const tab = tabs.find((item) => item.sessionId === id);
      if (!tab) return;
      tab.exited = true;
      tab.term.writeln(`\r\n${$localizedText.terminal.exited(code)}`);
      tabs = tabs;
    }));
    // The theme sets its colours on the page; the terminals take them once they are there.
    const retheme = () => setTimeout(() => tabs.forEach((tab) => { if (tab.term) tab.term.options.theme = themeNow(); }), 0);
    unsubscribe.push(activeTheme.subscribe(retheme), themeMode.subscribe(retheme));
    // Notes created or renamed (by the agent, too) become clickable in the output.
    const reloadNotes = () => { void loadKnownNotes(); };
    window.addEventListener(NOTES_PULLED_EVENT, reloadNotes);
    unsubscribe.push(() => window.removeEventListener(NOTES_PULLED_EVENT, reloadNotes));
  });

  onDestroy(() => {
    unsubscribe.forEach((stop) => stop());
    tabs.forEach((tab) => {
      if (tab.sessionId !== null && !tab.exited) terminalBridge?.kill(tab.sessionId);
      tab.term?.dispose();
    });
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
      fitTab(active);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function resetHeight() {
    height = clampTerminalHeight(undefined, window.innerHeight);
    try { localStorage.removeItem(HEIGHT_KEY); } catch { /* private window */ }
  }

  const iconButton = 'h-7 w-7 rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]';
  const menuItem = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-secondary)] focus-visible:text-[var(--text-primary)]';
  let menuOpen = false;
  let menuAnchor;
  function closeMenuOutside(event) {
    if (menuOpen && menuAnchor && !menuAnchor.contains(event.target)) menuOpen = false;
  }
</script>

<svelte:window on:pointerdown={closeMenuOutside} />

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
    <header class="flex h-8 shrink-0 items-center gap-2 px-3 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
      <span class="font-bold text-[var(--text-secondary)]">{$localizedText.terminal.title}</span>
      <!-- Tabs: each its own shell. -->
      <div class="flex min-w-0 items-center gap-1" role="tablist" aria-label={$localizedText.terminal.tabs}>
        {#each tabs as tab, index (tab.key)}
          <div class="group flex items-center rounded-ui {tab.key === activeKey ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)]'}">
            <button
              type="button"
              role="tab"
              aria-selected={tab.key === activeKey}
              data-testid="terminal-tab"
              on:click={() => activate(tab.key)}
              class="max-w-[10rem] truncate px-2 py-1 normal-case tracking-normal {tab.exited ? 'line-through opacity-60' : ''}"
            >{tab.title || `${$localizedText.terminal.tab} ${index + 1}`}</button>
            <button
              type="button"
              aria-label={$localizedText.terminal.closeTab}
              title={$localizedText.terminal.closeTab}
              data-testid="terminal-tab-close"
              on:click={() => closeTab(tab.key)}
              class="mr-1 rounded-ui p-0.5 opacity-0 transition hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100 {tab.key === activeKey ? 'opacity-60' : ''}"
            ><X size="12" strokeWidth="1.7" aria-hidden="true" /></button>
          </div>
        {/each}
        {#if tabs.length < MAX_TABS}
          <TooltipIconButton class={iconButton} label={$localizedText.terminal.newTab} tooltip={$localizedText.terminal.newTab} on:click={() => newTab()}>
            <Plus size="14" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
        {/if}
      </div>
      <span class="ml-auto"></span>
      {#if $agentReview.changes?.length}
        <button
          type="button"
          data-testid="agent-review-open"
          on:click={() => agentReviewOpen.set(true)}
          class="inline-flex h-7 shrink-0 items-center rounded-ui px-2 font-bold normal-case tracking-normal text-[var(--blue)] transition hover:bg-[var(--bg-secondary)]"
        >{$localizedText.agentReview.button($agentReview.changes.length)}</button>
      {/if}
      <button
        type="button"
        data-testid="agent-launch"
        on:click={() => agentRequest.set({ kind: 'launch', at: Date.now() })}
        class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ui px-2 font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
      >
        <Bot size="14" strokeWidth="1.7" aria-hidden="true" />{$localizedText.terminal.launch(agentLabel(agentCommand))}
      </button>
      <!-- Search, restart and the agent's rules: needed now and then, so behind ⋯ (⌘F still searches). A dot on
           ⋯ says the rules are missing. -->
      <div class="relative" bind:this={menuAnchor}>
        <TooltipIconButton class="{iconButton} relative" label={$localizedText.terminal.menu} tooltip={$localizedText.terminal.menu} tooltipAlign="end" data-testid="terminal-menu" on:click={() => { menuOpen = !menuOpen; }}>
          <MoreHorizontal size="14" strokeWidth="1.7" aria-hidden="true" />
          {#if rulesMissing}<span class="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--blue)]" aria-hidden="true"></span>{/if}
        </TooltipIconButton>
        {#if menuOpen}
          <!-- svelte-ignore a11y-interactive-supports-focus -->
          <div role="menu" on:keydown={(event) => { if (event.key === 'Escape') menuOpen = false; }} class="absolute bottom-full right-0 z-30 mb-1 w-80 whitespace-nowrap rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 text-sm normal-case tracking-normal text-[var(--text-secondary)] shadow-2xl" data-testid="terminal-menu-list">
            <button type="button" role="menuitem" class={menuItem} on:click={() => { menuOpen = false; void openSearch(); }}>
              <Search size="14" strokeWidth="1.7" aria-hidden="true" /><span class="flex-1">{$localizedText.terminal.searchMenu}</span><span class="text-xs text-[var(--text-tertiary)]">⌘F</span>
            </button>
            <button type="button" role="menuitem" class={menuItem} on:click={() => { menuOpen = false; restart(); }}>
              <RotateCcw size="14" strokeWidth="1.7" aria-hidden="true" /><span class="flex-1">{$localizedText.terminal.restart}</span>
            </button>
            {#if rulesMissing}
              <div class="my-1 h-px bg-[var(--border-subtle)]"></div>
              <button type="button" role="menuitem" data-testid="agent-rules-create" class={menuItem} title={$localizedText.terminal.rulesHint} on:click={() => { menuOpen = false; void createRules(); }}>
                <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" aria-hidden="true"></span><span class="flex-1">{$localizedText.terminal.rulesCreate}</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
      <TooltipIconButton class={iconButton} label={$localizedText.terminal.hide} tooltip={$localizedText.terminal.hide} tooltipAlign="end" on:click={() => terminalOpen.set(false)}>
        <X size="14" strokeWidth="1.7" aria-hidden="true" />
      </TooltipIconButton>
    </header>
    {#if searchOpen}
      <!-- Search in the visible tab: Enter for the next match, Shift+Enter for the one before, Esc to close. -->
      <div class="absolute right-3 top-9 z-20 flex items-center gap-1 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-lg" data-testid="terminal-search">
        <div class="relative w-56">
        <Search size="14" strokeWidth="1.7" class={SEARCH_ICON_COMPACT_CLASS} aria-hidden="true" />
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          on:input={() => findNext()}
          on:keydown={searchKeydown}
          placeholder={$localizedText.terminal.searchPlaceholder}
          aria-label={$localizedText.terminal.search}
          class="h-8 {SEARCH_INPUT_COMPACT_CLASS} pr-2"
        />
        </div>
        <button type="button" class={SEARCH_BUTTON_COMPACT_CLASS} aria-label={$localizedText.terminal.searchPrevious} on:click={() => findNext(true)}><ChevronUp size="14" strokeWidth="1.7" aria-hidden="true" /></button>
        <button type="button" class={SEARCH_BUTTON_COMPACT_CLASS} aria-label={$localizedText.terminal.searchNext} on:click={() => findNext()}><ChevronDown size="14" strokeWidth="1.7" aria-hidden="true" /></button>
        <button type="button" class={SEARCH_BUTTON_COMPACT_CLASS} aria-label={$localizedText.terminal.searchClose} on:click={closeSearch}><X size="14" strokeWidth="1.7" aria-hidden="true" /></button>
      </div>
    {/if}
    <div class="relative min-h-0 flex-1" role="presentation" on:contextmenu={openTermMenu}>
      {#each tabs as tab (tab.key)}
        <div
          class="absolute inset-0 px-3 pb-2"
          class:invisible={tab.key !== activeKey}
          data-testid="terminal-host"
          data-active={tab.key === activeKey}
          use:mountTerm={tab}
        ></div>
      {/each}
    </div>
    {#if termMenu.show}
      <div
        bind:this={termMenuEl}
        role="menu"
        tabindex="-1"
        aria-label={$localizedText.terminal.title}
        on:click|stopPropagation
        on:keydown={handleTermMenuKeys}
        class="fixed z-[130] w-44 overflow-hidden rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 shadow-2xl"
        style="left: {termMenuPos.x}px; top: {termMenuPos.y}px;"
      >
        <button type="button" role="menuitem" data-testid="terminal-copy" disabled={!termMenu.canCopy} class="w-full px-3 py-2 text-left text-xs outline-none transition hover:bg-[var(--bg-secondary)] focus-visible:bg-[var(--bg-secondary)] disabled:opacity-40 disabled:hover:bg-transparent" on:click={copySelection}>{$localizedText.terminal.copy}</button>
        <button type="button" role="menuitem" data-testid="terminal-paste" class="w-full px-3 py-2 text-left text-xs outline-none transition hover:bg-[var(--bg-secondary)] focus-visible:bg-[var(--bg-secondary)]" on:click={pasteClipboard}>{$localizedText.terminal.paste}</button>
        <button type="button" role="menuitem" data-testid="terminal-select-all" class="w-full px-3 py-2 text-left text-xs outline-none transition hover:bg-[var(--bg-secondary)] focus-visible:bg-[var(--bg-secondary)]" on:click={selectAllOutput}>{$localizedText.terminal.selectAll}</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  /* xterm's own scrollbar track would be a grey stripe on the theme's background. */
  :global([data-testid="terminal-host"] .xterm-viewport) { background-color: transparent !important; }
  :global([data-testid="terminal-host"] .xterm) { height: 100%; }
</style>
