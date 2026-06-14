import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';
import { markdownTextFromClipboard } from '../lib/rich-editor-paste.js';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { locale, uiText } from '../lib/strings.js';
import { contentWidth, editorFontSize, lineHeight } from '../stores.js';
import RichEditor from './RichEditor.svelte';

beforeEach(() => {
  locale.set('en');
});

test('RichEditor configures the StarterKit link extension', () => {
  const [starterKit] = createRichEditorExtensions(uiText.richEditor.beginWriting);

  expect(starterKit.name).toBe('starterKit');
  expect(starterKit.options.link).toEqual({ openOnClick: false });
});

test('RichEditor opens slash command menu and executes a command', async () => {
  render(RichEditor, {
    content: '',
    onUpdate: () => {},
  });

  const editorInput = screen.getByTestId('rich-editor-input');
  await fireEvent.keyDown(editorInput, { key: '/' });

  await waitFor(() => expect(screen.getByRole('listbox', {
    name: uiText.richEditor.slashMenuLabel,
  })).toBeTruthy());
  expect(screen.getByRole('option', {
    name: uiText.richEditor.slashCommands.heading1,
  })).toBeTruthy();

  await fireEvent.click(screen.getByRole('option', {
    name: uiText.richEditor.slashCommands.heading1,
  }));

  await waitFor(() => expect(screen.queryByRole('listbox', {
    name: uiText.richEditor.slashMenuLabel,
  })).toBeNull());
});

test('RichEditor keeps scrolling inside the editor body', () => {
  render(RichEditor, {
    content: 'Line one\n\nLine two',
    onUpdate: () => {},
  });

  expect(screen.getByTestId('rich-editor-surface').className).toContain('overflow-hidden');
  expect(screen.getByTestId('rich-editor-input').className).toContain('h-full');
  expect(screen.getByTestId('rich-editor-input').className).toContain('overflow-y-auto');
});

test('RichEditor does not add programmatic content loads to undo history', async () => {
  const onUpdate = vi.fn();
  const { component } = render(RichEditor, {
    content: '',
    onUpdate,
  });

  const undoButton = screen.getByLabelText(uiText.richEditor.undo);
  await waitFor(() => expect(undoButton.disabled).toBe(true));

  component.$set({ content: 'Loaded **note** body' });

  await waitFor(() => {
    expect(component.getMarkdown()).toContain('Loaded **note** body');
  });
  expect(undoButton.disabled).toBe(true);
  expect(onUpdate).not.toHaveBeenCalled();
});

test('RichEditor shows imported content that contains NUL bytes', async () => {
  const doc = markdownToEditorContent('Imported\u0000 Obsidian\u0000 note\u0000 body');

  expect(JSON.stringify(doc)).toContain('Imported Obsidian note body');
  expect(JSON.stringify(doc)).not.toContain('\\u0000');
});

test('RichEditor converts markdown parser schema names to TipTap schema names', () => {
  const doc = markdownToEditorContent('**Name:** Test  \nNext\n\n---\n\n- one\n- two');
  const serialized = JSON.stringify(doc);

  expect(serialized).toContain('"type":"bold"');
  expect(serialized).toContain('"type":"hardBreak"');
  expect(serialized).toContain('"type":"horizontalRule"');
  expect(serialized).toContain('"type":"bulletList"');
  expect(serialized).toContain('"type":"listItem"');
  expect(serialized).not.toContain('"type":"strong"');
  expect(serialized).not.toContain('"type":"hard_break"');
});

test('RichEditor converts markdown image syntax to image nodes', () => {
  const doc = markdownToEditorContent('Before ![diagram](_attachments/diagram.png) after');
  const imageOnlyDoc = markdownToEditorContent('![image-20260614](_attachments/image-20260614.png)');
  const serialized = JSON.stringify(doc);
  const imageOnlySerialized = JSON.stringify(imageOnlyDoc);

  expect(serialized).toContain('"type":"image"');
  expect(serialized).toContain('"src":"_attachments/diagram.png"');
  expect(serialized).toContain('"alt":"diagram"');
  expect(serialized).not.toContain('![diagram]');
  expect(imageOnlySerialized).toContain('"type":"image"');
  expect(imageOnlySerialized).toContain('"src":"_attachments/image-20260614.png"');
});

test('RichEditor detects markdown clipboard text for paste formatting', () => {
  const markdownClipboard = {
    types: ['text/plain'],
    getData: (type) => type === 'text/plain' ? '# Pasted Title\n\n**Bold** text\n\n- One\n- Two' : '',
  };
  const htmlClipboard = {
    types: ['text/html', 'text/plain'],
    getData: (type) => {
      if (type === 'text/plain') return '# Rendered page title';
      if (type === 'text/html') return '<h1>Rendered page title</h1>';
      return '';
    },
  };

  expect(markdownTextFromClipboard(markdownClipboard)).toContain('# Pasted Title');
  expect(markdownTextFromClipboard(htmlClipboard)).toBe('');
});

test('RichEditor exposes dropdowns for editor layout settings', async () => {
  render(RichEditor, {
    content: 'Line one',
    onUpdate: () => {},
  });

  await fireEvent.change(screen.getByRole('combobox', { name: uiText.richEditor.contentWidth }), {
    target: { value: 'narrow' },
  });
  await fireEvent.change(screen.getByRole('combobox', { name: uiText.richEditor.lineHeight }), {
    target: { value: 'relaxed' },
  });
  await fireEvent.change(screen.getByRole('combobox', { name: uiText.richEditor.fontSize }), {
    target: { value: 'xl' },
  });

  expect(get(contentWidth)).toBe('narrow');
  expect(get(lineHeight)).toBe('relaxed');
  expect(get(editorFontSize)).toBe('xl');
});

test('RichEditor configures the attachment image extension', () => {
  const extensions = createRichEditorExtensions(uiText.richEditor.beginWriting, {
    resolveImageSrc: (src) => `/raw/${src}`,
    resolveImagePath: (src) => `notes/${src}`,
  });
  const image = extensions.find((extension) => extension.name === 'image');

  expect(image).toBeTruthy();
  expect(image.options.resolveImageSrc('_attachments/image.webp')).toBe('/raw/_attachments/image.webp');
  expect(image.options.resolveImagePath('_attachments/image.webp')).toBe('notes/_attachments/image.webp');
});

test('RichEditor renders attachment image caption without file extension', () => {
  const extensions = createRichEditorExtensions(uiText.richEditor.beginWriting, {
    resolveImageSrc: (src) => `/raw/${src}`,
    resolveImagePath: (src) => `notes/${src}`,
  });
  const image = extensions.find((extension) => extension.name === 'image');
  const html = image.config.renderHTML.call(image, {
    HTMLAttributes: {
      src: '_attachments/image.webp',
      alt: 'image.webp',
    },
  });

  expect(html[0]).toBe('span');
  expect(html[1].class).toBe('editor-image-frame');
  expect(html[2][0]).toBe('img');
  expect(html[2][1]['data-attachment-path']).toBe('notes/_attachments/image.webp');
  expect(html[3]).toEqual(['span', { class: 'editor-image-caption' }, 'image']);
});

