import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  customNoteTemplates,
  getTemplateCatalog,
  hiddenLibraryTemplateIds,
} from '../lib/template-library.js';
import { locale, uiText } from '../lib/strings.js';
import TemplateManager from './TemplateManager.svelte';

beforeEach(() => {
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/api/templates' && (!init.method || init.method === 'GET')) {
      return {
        ok: true,
        async json() {
          return { customTemplates: [], hiddenLibraryTemplateIds: [] };
        },
      };
    }
    if (url === '/api/templates' && init.method === 'PUT') {
      return {
        ok: true,
        async json() {
          return JSON.parse(init.body);
        },
      };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  localStorage.clear();
  locale.set('en');
  hiddenLibraryTemplateIds.set(new Set());
  customNoteTemplates.set([]);
  globalThis.confirm = vi.fn(() => true);
});

test('TemplateManager creates custom templates and hides library templates', async () => {
  render(TemplateManager);

  await fireEvent.click(screen.getByRole('button', { name: uiText.templates.newTemplate }));
  await fireEvent.input(screen.getByLabelText(uiText.templates.templateTitle), {
    target: { value: 'My Research Template' },
  });
  await fireEvent.input(screen.getByLabelText(uiText.templates.description), {
    target: { value: 'Personal research structure' },
  });
  await fireEvent.input(screen.getByLabelText(uiText.templates.folder), {
    target: { value: 'Research' },
  });
  await fireEvent.input(screen.getByLabelText(uiText.templates.tags), {
    target: { value: 'research, custom' },
  });
  await fireEvent.input(screen.getByLabelText(uiText.templates.content), {
    target: { value: '# {{title}}\n\n## Notes\n-' },
  });
  await fireEvent.click(screen.getByRole('button', { name: uiText.templates.createTemplate }));

  await waitFor(() => expect(screen.getByRole('heading', { name: 'My Research Template' })).toBeTruthy());
  expect(get(customNoteTemplates)).toHaveLength(1);
  expect(get(customNoteTemplates)[0]).toMatchObject({
    title: 'My Research Template',
    category: 'Research',
    tags: ['research', 'custom'],
  });
  expect(getTemplateCatalog('en', get(hiddenLibraryTemplateIds), get(customNoteTemplates))[0].title)
    .toBe('My Research Template');

  await fireEvent.click(screen.getAllByRole('button', { name: uiText.templates.hide })[0]);
  expect(get(hiddenLibraryTemplateIds).size).toBe(1);
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/templates', expect.objectContaining({ method: 'PUT' })));
  const putCalls = globalThis.fetch.mock.calls.filter(([url, init]) => url === '/api/templates' && init?.method === 'PUT');
  const latestSaved = JSON.parse(putCalls.at(-1)[1].body);
  expect(latestSaved.customTemplates[0].title).toBe('My Research Template');
  expect(latestSaved.hiddenLibraryTemplateIds).toHaveLength(1);
  const visibleIds = getTemplateCatalog('en', get(hiddenLibraryTemplateIds), get(customNoteTemplates))
    .map((template) => template.id);
  expect(visibleIds).not.toContain([...get(hiddenLibraryTemplateIds)][0]);
});
