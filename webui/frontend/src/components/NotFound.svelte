<script>
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';

  // An address the app has no page for: a mistyped or an old link. It says so and offers the way back, instead
  // of showing some other page as if nothing were wrong.
  const dispatch = createEventDispatcher();
</script>

<section class="h-full overflow-y-auto px-4 py-10 sm:py-12 lg:px-12" data-testid="not-found">
  <div class="mx-auto max-w-xl">
    <h1 class="font-serif text-3xl tracking-tight text-[var(--text-primary)]">{$localizedText.app.notFound.title}</h1>
    <p class="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.app.notFound.text}</p>
    <div class="mt-6">
      <Button variant="primary" size="lg" on:click={() => dispatch('home')} data-testid="not-found-home">{$localizedText.app.notFound.home}</Button>
    </div>
  </div>
</section>
