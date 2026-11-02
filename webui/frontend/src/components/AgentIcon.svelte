<script>
  /**
   * An agent's mark: its colour and glyph from `lib/agent-icons.js`. `agent` is a catalogue id or a command
   * line; a command of the person's own gets a neutral prompt mark. The mark has no name of its own: the
   * label next to it (or the button's `label`) says which agent it is.
   */
  import { agentIcon } from '../lib/agent-icons.js';
  import { agentForCommand, AGENTS } from '../lib/agents.js';

  export let agent = 'claude';
  export let size = 16;
  // The menu hands every icon a stroke width; this mark has fixed strokes.
  // svelte-ignore unused-export-let
  export let strokeWidth = undefined;
  let klass = '';
  export { klass as class };

  $: known = AGENTS.find((item) => item.id === agent) || agentForCommand(agent);
  $: icon = agentIcon(known?.id);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  class="shrink-0 {klass}"
  {...$$restProps}
  style="color: {icon.fg}"
  aria-hidden="true"
  data-agent={known?.id || 'other'}
>
  <rect width="24" height="24" rx="6" fill={icon.bg} />
  {@html icon.body}
</svg>
