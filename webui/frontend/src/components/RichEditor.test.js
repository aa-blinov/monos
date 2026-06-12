import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { locale, uiText } from '../lib/strings.js';
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
