import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import SourceEditor from './SourceEditor.svelte';
import { locale, uiText } from '../lib/strings.js';

beforeEach(() => {
  locale.set('en');
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('SourceEditor рендерит wiki-link и диспатчит переход по клику', async () => {
  const { component, container } = render(SourceEditor, {
    content: 'See [[Target Note|Target]].',
    backlinks: [],
  });
  const handler = vi.fn();
  component.$on('wikiLinkClick', handler);

  const button = container.querySelector('.wikilink');
  expect(button).toBeTruthy();
  expect(button.textContent).toBe('Target');

  await fireEvent.click(button);
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({
    detail: 'Target Note',
  }));
});

test('SourceEditor показывает backlinks и диспатчит имя заметки', async () => {
  const { component } = render(SourceEditor, {
    content: 'Body',
    backlinks: [
      { name: 'Alpha', path: 'notes/Work/Alpha.md' },
      { name: 'Beta', path: 'notes/Beta.md' },
    ],
  });
  const handler = vi.fn();
  component.$on('wikiLinkClick', handler);

  expect(screen.getByText(uiText.sourceEditor.linkedMentions)).toBeTruthy();
  await fireEvent.click(screen.getByText('Alpha'));
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({
    detail: 'Alpha',
  }));
});

test('SourceEditor экранирует raw HTML и атрибуты wiki-link в preview', async () => {
  const { container } = render(SourceEditor, {
    content: '[[Target" onmouseover="alert(1)|<img src=x onerror=alert(1)>]]\n\n<script>alert(2)</script>\n<img src=x onerror=alert(3)>',
    backlinks: [],
  });

  expect(container.querySelector('script')).toBeNull();
  const image = container.querySelector('img');
  expect(image).toBeTruthy();
  expect(image.getAttribute('src')).toBe('/api/attachments/raw?path=notes%2Fx');
  expect(image.getAttribute('class')).toBe('attachment-image');
  expect(container.querySelector('[onerror]')).toBeNull();
  expect(container.querySelector('[onmouseover]')).toBeNull();

  const button = container.querySelector('.wikilink');
  expect(button).toBeTruthy();
  expect(button.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(button.dataset.target).toBe('Target" onmouseover="alert(1)');
});

test('SourceEditor вставляет markdown-картинку из буфера', async () => {
  const file = new File(['image'], 'clip.png', { type: 'image/png' });
  const onImageFile = vi.fn(async () => ({
    name: 'image-20260603.webp',
    relativePath: '_attachments/image-20260603.webp',
  }));
  const { component } = render(SourceEditor, {
    content: 'Before',
    backlinks: [],
    notePath: 'notes/Inbox.md',
    onImageFile,
  });

  const textarea = screen.getByPlaceholderText(uiText.sourceEditor.beginWriting);
  textarea.setSelectionRange(6, 6);
  await fireEvent.paste(textarea, {
    clipboardData: {
      files: [file],
      items: [],
    },
  });

  await waitFor(() => expect(onImageFile).toHaveBeenCalledWith(file));
  await waitFor(() => expect(textarea.value).toContain('![image-20260603](_attachments/image-20260603.webp)'));

  const imageHandler = vi.fn();
  component.$on('imageClick', imageHandler);
  await fireEvent.click(document.querySelector('img[data-attachment-path]'));
  expect(imageHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: expect.objectContaining({ path: 'notes/_attachments/image-20260603.webp' }),
  }));
});

test('SourceEditor вставляет markdown-картинку из base64 data URL', async () => {
  const onImageFile = vi.fn(async () => ({
    name: 'image-from-data-url.webp',
    relativePath: '_attachments/image-from-data-url.webp',
  }));
  render(SourceEditor, {
    content: 'Before',
    backlinks: [],
    notePath: 'notes/Inbox.md',
    onImageFile,
  });

  const textarea = screen.getByPlaceholderText(uiText.sourceEditor.beginWriting);
  await fireEvent.paste(textarea, {
    clipboardData: {
      files: [],
      items: [],
      getData(type) {
        return type === 'text/plain' ? 'data:image/png;base64,aW1hZ2U=' : '';
      },
    },
  });

  await waitFor(() => expect(onImageFile).toHaveBeenCalled());
  await waitFor(() => expect(textarea.value).toContain('![image-from-data-url](_attachments/image-from-data-url.webp)'));
});

test('SourceEditor не рендерит YAML frontmatter в preview', () => {
  const { container } = render(SourceEditor, {
    content: '---\ntitle: Alpha\ntags: []\n---\n\n# Body',
    backlinks: [],
  });

  expect(container.querySelector('.prose-preview hr')).toBeNull();
  expect(container.querySelector('.prose-preview')?.textContent).not.toContain('title: Alpha');
  expect(container.querySelector('.prose-preview h1')?.textContent).toBe('Body');
});

test('SourceEditor позволяет менять ширину source content на desktop', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1280,
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    right: 1000,
    top: 0,
    bottom: 600,
    width: 1000,
    height: 600,
    toJSON() {
      return {};
    },
  });

  render(SourceEditor, {
    content: 'Body',
    backlinks: [],
  });

  const resizer = await waitFor(() => screen.getByRole('button', {
    name: uiText.sourceEditor.resizeContent,
  }));

  await fireEvent.keyDown(resizer, { key: 'ArrowRight' });
  expect(localStorage.getItem('sourceEditorContentWidth')).toBe('52');

  await fireEvent.keyDown(resizer, { key: 'Enter' });
  expect(localStorage.getItem('sourceEditorContentWidth')).toBe('50');
});
