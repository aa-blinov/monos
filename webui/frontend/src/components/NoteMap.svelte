<script>
  /**
   * The map of the vault: a dot for every linked note, a line for every link, laid out so that notes that link
   * to each other sit close. Click a note to open it; the search finds one by name and dims the rest. Opened from
   * a note ("Show on the map") it centres on that note and keeps its neighbours clear. The page is drawn on a
   * canvas (thousands of dots), so the search and its list are the way to a note without a pointer.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { useLocation } from 'svelte-routing';
  import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
  import { Maximize2, Minus, Plus, X } from 'lucide-svelte';
  import SearchField from './SearchField.svelte';
  import Checkbox from './Checkbox.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { get } from '../lib/api/client.js';
  import { localizedText } from '../lib/strings.js';
  import {
    adjacency, centerOn, fitView, hitTest, hopDistances, layoutTicks, matchNotes, noteOpacity, nodeRadius, placeLabels, showsLabel, zoomAt,
  } from '../lib/note-map.js';

  const dispatch = createEventDispatcher();
  // The note to centre on comes from the address: /map?focus=<path> ('' for the whole map).
  const location = useLocation();
  $: focus = new URLSearchParams($location?.search || '').get('focus') || '';

  let status = 'loading';
  let nodes = [];
  let edges = [];
  let adj = new Map();
  let info = { noteCount: 0, orphanCount: 0, truncated: false };
  let showOrphans = false;
  let query = '';
  let focusPath = '';
  let hovered = '';
  let settled = false;

  let canvas;
  let box;
  let width = 0;
  let height = 0;
  let view = { k: 1, x: 0, y: 0 };
  let userMoved = false;
  let simulation = null;
  let frame = 0;
  let drawing = 0;
  let colors = null;
  let observer = null;
  let mutations = null;
  let latest = 0;
  const pointers = new Map();
  let dragged = false;
  let lastPinch = 0;

  $: matches = matchNotes(nodes, query);
  $: matchList = matches ? nodes.filter((node) => matches.has(node.path)).slice(0, 8) : [];
  $: distances = focusPath && adj.has(focusPath) ? hopDistances(adj, focusPath, 2) : null;
  $: focusNode = focusPath ? nodes.find((node) => node.path === focusPath) : null;
  $: if (focus !== focusPath) { focusPath = focus; applyFocus(); }
  $: matches, distances, hovered, requestDraw();

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    readColors();
    observer = new ResizeObserver(resize);
    observer.observe(box);
    // A theme change rewrites the variables on the page: the colours are read again.
    mutations = new MutationObserver(() => { readColors(); requestDraw(); });
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    resize();
    load();
  });

  onDestroy(() => {
    simulation?.stop();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(drawing);
    observer?.disconnect();
    mutations?.disconnect();
  });

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    colors = {
      ink: read('--text-primary', '#222'),
      node: read('--text-tertiary', '#888'),
      line: read('--text-tertiary', '#888'),
      bg: read('--bg-primary', '#fff'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    };
  }

  async function load() {
    const request = ++latest;
    status = 'loading';
    simulation?.stop();
    try {
      const data = await get('/api/graph', { orphans: showOrphans ? 1 : 0 });
      if (request !== latest) return;
      info = { noteCount: data.noteCount || 0, orphanCount: data.orphanCount || 0, truncated: Boolean(data.truncated) };
      const list = Array.isArray(data.nodes) ? data.nodes : [];
      const known = new Set(list.map((node) => node.path));
      // A note asked for by the link that is not on the map only because it has no links: bring the orphans in.
      if (focusPath && !known.has(focusPath) && !showOrphans && info.orphanCount > 0) {
        showOrphans = true;
        return load();
      }
      nodes = list.map((node) => ({ ...node }));
      edges = (Array.isArray(data.edges) ? data.edges : []).filter((edge) => known.has(edge.from) && known.has(edge.to));
      adj = adjacency(edges);
      status = nodes.length === 0 ? 'empty' : 'ready';
      userMoved = false;
      if (nodes.length) layout();
    } catch (error) {
      if (request !== latest) return;
      console.error('Failed to load the map:', error);
      status = 'error';
    }
  }

  // The layout runs a few ticks a frame until it settles, so the map draws itself in; with "reduce motion" it is
  // finished before the first draw.
  function layout() {
    settled = false;
    const links = edges.map((edge) => ({ source: edge.from, target: edge.to }));
    simulation = forceSimulation(nodes)
      .force('link', forceLink(links).id((node) => node.path).distance(34).strength(0.55))
      .force('charge', forceManyBody().strength(-46).distanceMax(260).theta(0.9))
      .force('collide', forceCollide((node) => nodeRadius(node.degree) + 2))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.035))
      .force('y', forceY(0).strength(0.035))
      .stop();
    const total = layoutTicks(nodes.length);
    let done = 0;
    if (reducedMotion()) {
      simulation.tick(total);
      finish();
      return;
    }
    const perFrame = nodes.length > 1200 ? 2 : nodes.length > 400 ? 4 : 8;
    const step = () => {
      const n = Math.min(perFrame, total - done);
      simulation.tick(n);
      done += n;
      if (!userMoved) fitAll(false);
      requestDraw();
      if (done < total) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
  }

  function finish() {
    settled = true;
    nodes = nodes;
    if (focusPath) applyFocus();
    else if (!userMoved) fitAll(false);
    requestDraw();
  }

  function fitAll(mark = true) {
    view = fitView(nodes, width, height);
    if (mark) userMoved = false;
    requestDraw();
  }

  function applyFocus() {
    if (!settled || !focusPath) return;
    const hops = hopDistances(adj, focusPath, 2);
    const around = nodes.filter((node) => hops.has(node.path));
    if (!around.length) return;
    view = fitView(around, width, height, { padding: 70, maxScale: 1.6 });
    userMoved = true;
    requestDraw();
  }

  function clearFocus() {
    focusPath = '';
    dispatch('clearFocus');
    fitAll();
  }

  function resize() {
    if (!box || !canvas) return;
    const rect = box.getBoundingClientRect();
    width = Math.max(0, Math.round(rect.width));
    height = Math.max(0, Math.round(rect.height));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (nodes.length && !userMoved) view = focusPath && settled ? view : fitView(nodes, width, height);
    requestDraw();
  }

  function requestDraw() {
    if (drawing || typeof requestAnimationFrame !== 'function') return;
    drawing = requestAnimationFrame(() => { drawing = 0; draw(); });
  }

  function draw() {
    if (!canvas || !colors) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!nodes.length) return;

    const byPath = new Map(nodes.map((node) => [node.path, node]));
    const opacity = (path) => noteOpacity({ path, distances, matches, hovered, adj });
    const sx = (node) => node.x * view.k + view.x;
    const sy = (node) => node.y * view.k + view.y;
    const emphasisPath = hovered || focusPath;

    ctx.lineWidth = 1;
    for (const edge of edges) {
      const a = byPath.get(edge.from);
      const b = byPath.get(edge.to);
      if (!a || !b) continue;
      const strong = emphasisPath && (edge.from === emphasisPath || edge.to === emphasisPath);
      ctx.globalAlpha = Math.min(opacity(edge.from), opacity(edge.to)) * (strong ? 0.9 : 0.32);
      ctx.strokeStyle = strong ? colors.ink : colors.line;
      ctx.beginPath();
      ctx.moveTo(sx(a), sy(a));
      ctx.lineTo(sx(b), sy(b));
      ctx.stroke();
    }

    // Dim notes first, so a bright one is never hidden under a faded one.
    const order = [...nodes].sort((a, b) => opacity(a.path) - opacity(b.path));
    for (const node of order) {
      const alpha = opacity(node.path);
      const r = nodeRadius(node.degree);
      const x = sx(node);
      const y = sy(node);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = node.color || colors.node;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (node.path === focusPath || node.path === hovered) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.ink;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    ctx.font = `12px ${colors.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const candidates = [];
    for (const node of order) {
      const alpha = opacity(node.path);
      const emphasised = node.path === hovered || node.path === focusPath || Boolean(matches?.has(node.path)) || Boolean(hovered && adj.get(hovered)?.has(node.path));
      if (alpha < 0.5 || !showsLabel({ degree: node.degree, scale: view.k, emphasised })) continue;
      const x = sx(node);
      const y = sy(node) + nodeRadius(node.degree) + 3;
      if (x < -60 || y < -20 || x > width + 60 || y > height + 20) continue;
      const text = [...node.title].length > 28 ? `${[...node.title].slice(0, 27).join('')}…` : node.title;
      candidates.push({ text, x, y, alpha, w: ctx.measureText(text).width, h: 13, priority: (emphasised ? 1e6 : 0) + node.degree });
    }
    for (const label of placeLabels(candidates)) {
      ctx.globalAlpha = label.alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.bg;
      ctx.strokeText(label.text, label.x, label.y);
      ctx.fillStyle = colors.ink;
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.globalAlpha = 1;
  }

  function toLocal(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, toLocal(event));
    dragged = false;
    if (pointers.size === 2) lastPinch = pinchDistance();
  }

  function pinchDistance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerMove(event) {
    const point = toLocal(event);
    if (!pointers.has(event.pointerId)) {
      // No button down: only pointing.
      if (event.pointerType === 'mouse') {
        const hit = hitTest(nodes, view, point.x, point.y);
        const path = hit?.path || '';
        if (path !== hovered) hovered = path;
        canvas.style.cursor = path ? 'pointer' : 'grab';
      }
      return;
    }
    const before = pointers.get(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const now = pinchDistance();
      if (lastPinch > 0) {
        const [a, b] = [...pointers.values()];
        view = zoomAt(view, now / lastPinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      lastPinch = now;
      dragged = true;
      userMoved = true;
      requestDraw();
      return;
    }
    const dx = point.x - before.x;
    const dy = point.y - before.y;
    if (!dragged && Math.hypot(dx, dy) < 2) return;
    dragged = true;
    userMoved = true;
    view = { ...view, x: view.x + dx, y: view.y + dy };
    canvas.style.cursor = 'grabbing';
    requestDraw();
  }

  function onPointerUp(event) {
    const point = toLocal(event);
    const wasDown = pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    lastPinch = 0;
    if (!wasDown) return;
    canvas.style.cursor = 'grab';
    if (dragged || pointers.size) return;
    const hit = hitTest(nodes, view, point.x, point.y, event.pointerType === 'touch' ? 12 : 4);
    if (hit) dispatch('open', hit.path);
  }

  function onPointerLeave() {
    if (!pointers.size && hovered) hovered = '';
  }

  function onWheel(event) {
    event.preventDefault();
    const point = toLocal(event);
    view = zoomAt(view, Math.exp(-event.deltaY * 0.0015), point.x, point.y);
    userMoved = true;
    requestDraw();
  }

  function zoomBy(factor) {
    view = zoomAt(view, factor, width / 2, height / 2);
    userMoved = true;
    requestDraw();
  }

  function onKeydown(event) {
    const pan = 48;
    if (event.key === '+' || event.key === '=') zoomBy(1.25);
    else if (event.key === '-' || event.key === '_') zoomBy(0.8);
    else if (event.key === '0') fitAll();
    else if (event.key === 'ArrowLeft') view = { ...view, x: view.x + pan };
    else if (event.key === 'ArrowRight') view = { ...view, x: view.x - pan };
    else if (event.key === 'ArrowUp') view = { ...view, y: view.y + pan };
    else if (event.key === 'ArrowDown') view = { ...view, y: view.y - pan };
    else return;
    event.preventDefault();
    userMoved = true;
    requestDraw();
  }

  function onSearchKeydown(event) {
    if (event.key === 'Enter' && matchList.length) {
      event.preventDefault();
      dispatch('open', matchList[0].path);
    }
  }

  function toggleOrphans() {
    load();
  }

  $: counts = $localizedText.map.counts(nodes.length, edges.length);
  // Where the note in focus sits on screen, once the layout has settled: what lets a test (and a screen reader's
  // companion tool) find a dot on a canvas.
  $: focusScreen = focusNode && settled ? `${Math.round(focusNode.x * view.k + view.x)},${Math.round(focusNode.y * view.k + view.y)}` : '';
</script>

<div class="flex h-full min-h-0 flex-col gap-3 px-4 py-4 lg:px-12 lg:py-8" data-testid="note-map">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
    <h1 class="font-serif text-2xl tracking-tight text-[var(--text-primary)]">{$localizedText.map.title}</h1>
    <div class="relative min-w-0 flex-1 basis-60 sm:max-w-sm sm:flex-none sm:basis-72">
      <SearchField
        testid="map-search"
        placeholder={$localizedText.map.search}
        bind:value={query}
        on:keydown={onSearchKeydown}
      />
      {#if query.trim()}
        <ul class="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-lg shadow-black/10" data-testid="map-results">
          {#each matchList as node (node.path)}
            <li>
              <button
                type="button"
                class="flex min-h-9 w-full items-center justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                data-testid="map-result"
                on:click={() => dispatch('open', node.path)}
              >
                <span class="min-w-0 truncate font-medium text-[var(--text-primary)]">{node.title}</span>
                <span class="shrink-0 tabular-nums text-[var(--text-tertiary)]">{node.degree}</span>
              </button>
            </li>
          {:else}
            <li class="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">{$localizedText.map.noMatches}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="flex items-center gap-4 sm:ml-auto">
      {#if info.orphanCount > 0 || showOrphans}
        <Checkbox id="map-orphans" bind:checked={showOrphans} on:change={toggleOrphans}>
          <span class="text-xs text-[var(--text-secondary)]">{$localizedText.map.orphans(info.orphanCount)}</span>
        </Checkbox>
      {/if}
      <div class="inline-flex items-center gap-1 rounded-ui border border-[var(--border-subtle)] p-1">
        <TooltipIconButton label={$localizedText.map.zoomOut} class="flex h-7 w-8 items-center justify-center rounded-ui text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" on:click={() => zoomBy(0.8)}>
          <Minus size="14" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton label={$localizedText.map.zoomIn} class="flex h-7 w-8 items-center justify-center rounded-ui text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" on:click={() => zoomBy(1.25)}>
          <Plus size="14" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton label={$localizedText.map.fit} tooltipAlign="end" class="flex h-7 w-8 items-center justify-center rounded-ui text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" on:click={() => fitAll()}>
          <Maximize2 size="14" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
      </div>
    </div>
  </div>

  <div class="relative min-h-0 flex-1 overflow-hidden rounded-ui border border-[var(--border-subtle)]" bind:this={box}>
    <!-- The canvas is a picture; the search and its list are the way to a note. The wrapper takes the keys. -->
    <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
    <div
      class="absolute inset-0 outline-none"
      tabindex="0"
      role="application"
      aria-label={$localizedText.map.canvasLabel(nodes.length)}
      data-focus-screen={focusScreen}
      on:keydown={onKeydown}
    >
      <canvas
        bind:this={canvas}
        class="block touch-none cursor-grab"
        aria-hidden="true"
        data-testid="map-canvas"
        on:pointerdown={onPointerDown}
        on:pointermove={onPointerMove}
        on:pointerup={onPointerUp}
        on:pointercancel={onPointerUp}
        on:pointerleave={onPointerLeave}
        on:wheel={onWheel}
      ></canvas>
    </div>

    {#if focusNode}
      <div class="absolute left-3 top-3 flex max-w-[80%] items-center gap-1 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 pl-3 pr-1 text-xs text-[var(--text-secondary)]" data-testid="map-focus">
        <span class="min-w-0 truncate">{$localizedText.map.around(focusNode.title)}</span>
        <button type="button" class="inline-flex h-7 shrink-0 items-center gap-1 rounded-ui px-2 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" aria-label={$localizedText.map.showAll} on:click={clearFocus}>
          <X size="12" strokeWidth="1.7" aria-hidden="true" />{$localizedText.map.showAll}
        </button>
      </div>
    {/if}

    {#if status === 'ready'}
      <p class="pointer-events-none absolute bottom-2 left-3 right-3 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]" data-testid="map-counts">
        {counts}{#if info.truncated}. {$localizedText.map.truncated(nodes.length, info.noteCount)}{/if}
      </p>
    {:else if status === 'loading'}
      <p class="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-[var(--text-secondary)]" role="status">{$localizedText.map.loading}</p>
    {:else if status === 'empty'}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" data-testid="map-empty">
        <p class="font-serif text-xl text-[var(--text-primary)]">{$localizedText.map.emptyTitle}</p>
        <p class="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.map.emptyHint}</p>
      </div>
    {:else if status === 'error'}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
        <p class="text-sm text-[var(--text-secondary)]">{$localizedText.map.loadFailed}</p>
        <button type="button" class="inline-flex min-h-9 items-center text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] hover:opacity-60" on:click={load}>{$localizedText.map.retry}</button>
      </div>
    {/if}
  </div>
</div>
