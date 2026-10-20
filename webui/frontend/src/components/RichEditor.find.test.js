import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import { SearchQuery, getSearchState, setSearchState } from 'prosemirror-search';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';
import { locale, uiText } from '../lib/strings.js';
import RichEditor from './RichEditor.svelte';

beforeEach(() => {
  locale.set('en');
});

test('плагин поиска находит совпадения в тексте заметки', () => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: createRichEditorExtensions('...'),
    content: markdownToEditorContent('Одна команда и ещё команда\n'),
  });
  editor.view.dispatch(setSearchState(editor.view.state.tr, new SearchQuery({ search: 'команда' })));
  expect(getSearchState(editor.view.state).deco.find()).toHaveLength(2);
});

test('поиск по заметке: панель считает совпадения и шагает по ним', async () => {
  const { component } = render(RichEditor, {
    content: 'Одна команда и ещё команда\n',
    onUpdate: () => {},
  });

  component.openFind();
  const input = await screen.findByTestId('note-find-input');
  await fireEvent.input(input, { target: { value: 'команда' } });
  expect(screen.getByTestId('note-find-count').textContent).toContain('2 matches');

  const next = screen.getByRole('button', { name: uiText.richEditor.findNext });
  await fireEvent.click(next);
  expect(screen.getByTestId('note-find-count').textContent).toContain('1 of 2');
  await fireEvent.click(next);
  expect(screen.getByTestId('note-find-count').textContent).toContain('2 of 2');

  // Пустое слово совпадений не даёт, а Esc закрывает панель.
  await fireEvent.input(input, { target: { value: 'нет такого' } });
  expect(screen.getByTestId('note-find-count').textContent).toContain('No matches');
  await fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByTestId('note-find')).toBeNull();
});
