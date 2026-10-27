<script>
  /**
   * The top bar of the desktop window on macOS and Windows, where the system's own bar is hidden: one strip, the
   * same on both, that the window is moved by. The traffic lights (macOS) and the minimise, maximise and close
   * buttons (Windows, tinted to the theme) stay the system's. In a browser and on Linux there is no strip.
   */
  import { onDestroy, onMount } from 'svelte';

  /** The name of what the window shows: "CV — Monos". */
  export let title = '';

  const bridge = typeof window !== 'undefined' ? window.monosWindow : null;
  const active = Boolean(bridge?.customTitleBar);
  const platform = bridge?.platform || '';

  let strip;
  let fullScreen = false;
  let observer;
  let stopFullScreen = () => {};

  // The Windows buttons are drawn by the system; they take the strip's own colours, so a theme change repaints them.
  function sendColors() {
    if (!strip || platform !== 'win32') return;
    const style = getComputedStyle(strip);
    bridge.setTitleBarColors({ color: style.backgroundColor, symbolColor: style.color });
  }

  onMount(() => {
    if (!active) return;
    sendColors();
    observer = new MutationObserver(sendColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] });
    stopFullScreen = bridge.onFullScreen?.((on) => { fullScreen = on; }) || (() => {});
  });

  onDestroy(() => {
    observer?.disconnect();
    stopFullScreen();
  });
</script>

{#if active}
  <!-- The whole strip is the handle; it holds nothing to click, so nothing needs to opt out of the drag. -->
  <div
    bind:this={strip}
    class="title-bar"
    data-testid="title-bar"
    data-platform={platform}
    data-fullscreen={fullScreen ? 'true' : undefined}
  >
    <div class="title-bar-inner">
      <span class="title-bar-title">{title}</span>
    </div>
  </div>
{/if}

<style>
  .title-bar {
    flex: none;
    height: var(--titlebar-height, 40px);
    display: flex;
    align-items: center;
    background: var(--bg-primary);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-subtle);
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
  }
  .title-bar-inner {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: center;
    padding: 0 0.75rem;
  }
  /* Room for the traffic lights on the left, mirrored on the right so the title stays in the middle. */
  .title-bar[data-platform='darwin'] .title-bar-inner {
    padding: 0 5.5rem;
  }
  .title-bar[data-platform='darwin'][data-fullscreen='true'] .title-bar-inner {
    padding: 0 0.75rem;
  }
  /* Windows: the buttons sit at the right; the overlay tells the page how much room is left. */
  .title-bar[data-platform='win32'] .title-bar-inner {
    flex: none;
    width: env(titlebar-area-width, calc(100% - 9rem));
    padding: 0 0.75rem;
  }
  .title-bar-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-whisper, 0.75rem);
    letter-spacing: 0.02em;
  }
</style>
