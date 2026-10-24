<script>
  import { createEventDispatcher } from 'svelte';
  import Checkbox from './Checkbox.svelte';
  import { localizedText } from '../lib/strings.js';
  import { flushOpenNote } from '../lib/note-refresh.js';
  import { Button, FieldControl, IconButton } from '@monos/ui';
  import { setPropertyRequest } from '../lib/editor-api.js';
  import {
    PROPERTY_TYPES,
    propertyInputText,
    propertyInputType,
    propertyName,
    propertyValueFrom,
  } from '../lib/properties.js';

  // The custom properties of the open note. Each change is written to the note's frontmatter at once;
  // the editor then reloads the note, so what it shows is what is on disk.
  export let filePath = '';
  export let properties = [];

  const dispatch = createEventDispatcher();

  let error = '';
  let busy = false;
  let newName = '';
  let newType = 'text';
  let newText = '';
  let newChecked = false;
  $: typeOptions = PROPERTY_TYPES.map((type) => ({ value: type, label: $localizedText.properties.typeNames[type] }));

  function invalidValue(type) {
    return $localizedText.properties.invalidValue.replace('{type}', $localizedText.properties.typeNames[type]);
  }

  async function write(body) {
    error = '';
    busy = true;
    try {
      // Pending typing is saved first, so the write cannot be overwritten by the next autosave.
      await flushOpenNote();
      const result = await setPropertyRequest(filePath, body);
      dispatch('changed', result.properties);
      return true;
    } catch (failure) {
      console.error('Failed to save the property:', failure);
      error = $localizedText.properties.saveFailed;
      return false;
    } finally {
      busy = false;
    }
  }

  function saveValue(property, raw) {
    const value = propertyValueFrom(property.type, raw);
    if (value === null) {
      error = invalidValue(property.type);
      return;
    }
    write({ key: property.key, type: property.type, value });
  }

  function changeType(property, type) {
    const value = propertyValueFrom(type, propertyInputText(property));
    if (value === null) {
      error = invalidValue(type);
      return;
    }
    write({ key: property.key, type, value });
  }

  function remove(property) {
    write({ key: property.key, remove: true });
  }

  async function add() {
    const key = propertyName(newName);
    if (!key) {
      error = $localizedText.properties.invalidName;
      return;
    }
    const value = newType === 'checkbox' ? newChecked : propertyValueFrom(newType, newText);
    if (value === null) {
      error = invalidValue(newType);
      return;
    }
    if (await write({ key, type: newType, value })) {
      newName = '';
      newText = '';
      newChecked = false;
    }
  }
</script>

<div class="space-y-3" data-testid="note-properties">
  {#if properties.length === 0}
    <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.empty}</p>
  {:else}
    <ul class="space-y-2">
      {#each properties as property (property.key)}
        <li class="flex min-w-0 items-center gap-2" data-testid="note-property">
          <span class="w-24 shrink-0 truncate text-xs text-[var(--text-secondary)]" title={property.key}>{property.key}</span>
          {#if property.type === 'checkbox'}
            <div class="flex flex-1 items-center">
              <Checkbox
                checked={property.value === true}
                disabled={busy}
                on:change={(event) => saveValue(property, event.target.checked)}
              />
            </div>
          {:else}
            <FieldControl
              type={propertyInputType(property.type)}
              value={propertyInputText(property)}
              disabled={busy}
              aria-label={property.key}
              class="min-w-0 flex-1"
              on:change={(event) => saveValue(property, (event.detail ?? event).target.value)}
            />
          {/if}
          <FieldControl
            as="select"
            value={property.type}
            disabled={busy}
            aria-label={$localizedText.properties.type}
            options={typeOptions}
            class="!w-auto shrink-0"
            on:change={(event) => changeType(property, (event.detail ?? event).target.value)}
          />
          <IconButton
            bare
            tooltipText=""
            label={$localizedText.properties.remove.replace('{name}', property.key)}
            disabled={busy}
            class="shrink-0 px-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--red-text)]"
            on:click={() => remove(property)}
          >×</IconButton>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="space-y-2 border-t border-[var(--border-subtle)] pt-3" on:submit|preventDefault={add}>
    <div class="flex items-center gap-2">
      <FieldControl
        type="text"
        bind:value={newName}
        disabled={busy}
        placeholder={$localizedText.properties.name}
        aria-label={$localizedText.properties.name}
        class="min-w-0 flex-1"
      />
      <FieldControl
        as="select"
        bind:value={newType}
        disabled={busy}
        aria-label={$localizedText.properties.type}
        options={typeOptions}
        class="!w-auto shrink-0"
      />
    </div>
    <div class="flex items-center gap-2">
      {#if newType === 'checkbox'}
        <div class="flex flex-1 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Checkbox bind:checked={newChecked} disabled={busy} />
          <span>{$localizedText.properties.value}</span>
        </div>
      {:else if newType === 'number'}
        <FieldControl
          type="number"
          bind:value={newText}
          disabled={busy}
          placeholder={$localizedText.properties.value}
          aria-label={$localizedText.properties.value}
          class="min-w-0 flex-1"
        />
      {:else if newType === 'date'}
        <FieldControl
          type="date"
          bind:value={newText}
          disabled={busy}
          aria-label={$localizedText.properties.value}
          class="min-w-0 flex-1"
        />
      {:else}
        <FieldControl
          type="text"
          bind:value={newText}
          disabled={busy}
          placeholder={$localizedText.properties.value}
          aria-label={$localizedText.properties.value}
          class="min-w-0 flex-1"
        />
      {/if}
      <Button type="submit" variant="ghost" size="sm" disabled={busy || !newName.trim()}>{$localizedText.properties.add}</Button>
    </div>
  </form>

  {#if error}
    <p role="alert" class="text-xs text-[var(--red-text)]">{error}</p>
  {/if}
</div>
