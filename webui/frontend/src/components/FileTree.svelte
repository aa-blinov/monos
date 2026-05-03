<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let node;
  export let expanded = false;
  export let selectedPath = null;

  let isExpanded = expanded;

  function toggleExpanded() {
    if (node.is_dir) {
      isExpanded = !isExpanded;
    }
  }

  function handleClick() {
    dispatch('selectFile', { path: node.path, name: node.name, isDir: node.is_dir });
  }

  function handleSelect() {
    if (node.is_dir) {
      toggleExpanded();
    }
    handleClick();
  }
</script>

<div class="text-xs">
  <button
    class="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all border-l-2 text-left"
    class:border-[var(--text-primary)]={selectedPath === node.path}
    class:border-transparent={selectedPath !== node.path}
    class:bg-[var(--border-subtle)]={selectedPath === node.path}
    on:click={handleSelect}
    on:keydown={(e) => e.key === 'Enter' && handleSelect()}
  >
    {#if node.is_dir}
      <span class="text-[8px] opacity-40 w-2">
        {isExpanded ? '●' : '○'}
      </span>
    {:else}
      <div class="w-2" />
    {/if}

    <div class="flex-1 min-w-0">
      <div
        class="truncate tracking-tight font-medium"
        class:text-[var(--text-primary)]={selectedPath === node.path}
        class:text-[var(--text-secondary)]={selectedPath !== node.path}
      >
        {node.name}
      </div>
    </div>
  </button>

  {#if node.is_dir && isExpanded && node.children}
    <div class="ml-4">
      {#each node.children as child (child.path)}
        <svelte:self
          node={child}
          {selectedPath}
          on:selectFile
        />
      {/each}
    </div>
  {/if}
</div>


<style>
  div :global(button) {
    padding: 0;
  }
</style>
