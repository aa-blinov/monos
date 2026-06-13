import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import NoteBoard from './NoteBoard.svelte';
import { locale, uiText } from '../lib/strings.js';
import { boardColumns, boardGroupByColor } from '../stores.js';

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

const notes = [
  {
    path: 'notes/Work/Alpha.md',
    name: 'Alpha',
    excerpt: 'Alpha excerpt',
    color: '#8ec07c',
    tags: ['work'],
    category: 'Work',
    lastOpened: '2026-06-03T10:20:00.000Z',
  },
  {
    path: 'notes/Work/Beta.md',
    name: 'Beta',
    excerpt: 'Beta excerpt',
    color: '#fabd2f',
    tags: [],
    category: 'Work',
    lastOpened: '2026-06-02T10:20:00.000Z',
  },
];

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  locale.set('en');
  boardColumns.set('3');
  boardGroupByColor.set(false);
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init.method || 'GET';

    if (url === '/api/file?path=notes%2FWork%2FAlpha.md') {
      return jsonResponse({ content: '---\ntitle: Alpha\ntags: []\n---\n\n## Alpha heading\n\nAlpha body preview' });
    }

    if (url === '/api/file?path=notes%2FWork%2FBeta.md') {
      return jsonResponse({ content: '---\ntitle: Beta\ntags: []\n---\n\nBeta body start for the board card.' });
    }

    if (url === '/api/notes/reorder' && method === 'POST') {
      const body = JSON.parse(init.body);
      return jsonResponse(body.paths.map((notePath, index) => ({
        ...notes.find((note) => note.path === notePath),
        path: notePath,
        boardOrder: index + 1,
      })));
    }

    if (url === '/api/directory/icon?path=notes%2FWork%2FBeta.md' && method === 'POST') {
      return jsonResponse({ message: 'Icon updated' });
    }

    if (url === '/api/search' && method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.query === 'beta' && body.search_content === true) {
        return jsonResponse([{ ...notes[1], excerpt: 'Beta full text match' }]);
      }
      return jsonResponse([]);
    }

    return jsonResponse({}, false);
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('NoteBoard открывает карточку сразу в полную заметку', async () => {
  const { component } = render(NoteBoard, { notes });
  const openFull = vi.fn();
  component.$on('openFull', openFull);

  await fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));

  expect(openFull).toHaveBeenCalledWith(expect.objectContaining({
    detail: expect.objectContaining({ path: 'notes/Work/Alpha.md' }),
  }));
  expect(screen.queryByTestId('note-preview-body')).toBeNull();
});

test('NoteBoard context menu может перекрасить карточку', async () => {
  render(NoteBoard, { notes });

  await fireEvent.contextMenu(screen.getByRole('button', { name: /Beta/ }), { clientX: 20, clientY: 30 });
  expect(screen.queryByRole('menuitem', { name: /Bring to top/ })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: /Preview/ })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.applyColor('#8ec07c') }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/directory/icon?path=notes%2FWork%2FBeta.md', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ color: '#8ec07c' }),
  })));
});

test('NoteBoard группирует board по цветам только после включения переключателя', async () => {
  render(NoteBoard, { notes });

  expect(screen.queryByText(uiText.app.board.colorGroup('#8ec07c'))).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.groupByColor }));

  expect(screen.getByText(uiText.app.board.colorGroup('#8ec07c'))).toBeTruthy();
  expect(screen.getByText(uiText.app.board.colorGroup('#fabd2f'))).toBeTruthy();
});

test('NoteBoard показывает переключатель группировки по цветам на мобильном', async () => {
  render(NoteBoard, { notes, mobile: true });

  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.groupByColor }));

  expect(screen.getByText(uiText.app.board.colorGroup('#8ec07c'))).toBeTruthy();
  expect(screen.getByText(uiText.app.board.colorGroup('#fabd2f'))).toBeTruthy();
});

test('NoteBoard на laptop ширине показывает только 2 и 3 колонки', async () => {
  boardColumns.set('4');
  render(NoteBoard, { notes });

  await waitFor(() => expect(get(boardColumns)).toBe('3'));
  expect(screen.getByRole('button', { name: uiText.app.board.columns(2) })).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.board.columns(3) })).toBeTruthy();
  expect(screen.queryByRole('button', { name: uiText.app.board.columns(4) })).toBeNull();
});

test('NoteBoard на широкой ширине показывает 2, 3 и 4 колонки', () => {
  window.innerWidth = 1440;
  render(NoteBoard, { notes });

  expect(screen.getByRole('button', { name: uiText.app.board.columns(2) })).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.board.columns(3) })).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.board.columns(4) })).toBeTruthy();
});

test('NoteBoard показывает много тегов перед датой открытия в desktop карточке', () => {
  const taggedNote = {
    ...notes[0],
    tags: ['work', 'release', 'smoke', 'mobile', 'design', 'review', 'archive', 'later'],
  };

  render(NoteBoard, { notes: [taggedNote] });

  const card = screen.getByRole('button', { name: /Alpha/ });
  const text = card.textContent;
  expect(text).toContain('#work');
  expect(text).toContain('#smoke');
  expect(text).toContain('+5');
  expect(text).not.toContain('#review');
  expect(text.indexOf('+5')).toBeLessThan(text.indexOf(uiText.app.board.opened));
});

test('NoteBoard показывает путь под названием без имени файла', () => {
  const nestedNote = {
    path: 'notes/Projects/Archive/Idea.md',
    name: 'Idea Title',
    excerpt: 'Short body',
    tags: [],
    lastOpened: '2026-06-03T10:20:00.000Z',
  };

  render(NoteBoard, { notes: [nestedNote] });

  const card = screen.getByRole('button', { name: /Idea Title/ });
  const text = card.textContent;
  expect(text).toContain('Idea Title');
  expect(text).toContain('Projects/Archive');
  expect(text).not.toContain('Projects/Archive/Idea.md');
  expect(text.indexOf('Idea Title')).toBeLessThan(text.indexOf('Projects/Archive'));
});

test('NoteBoard показывает дату открытия на мобильной карточке коротким форматом', () => {
  locale.set('en');
  render(NoteBoard, {
    mobile: true,
    notes: [{
      path: 'notes/Daily/13-06-26-13-16-01.md',
      name: '13-06-26-13-16-01',
      excerpt: 'Приветик, как ты, как сам',
      tags: [],
      lastOpened: '2026-06-13T13:16:01.000Z',
    }],
  });

  const card = screen.getByRole('button', { name: /13-06-26-13-16-01/ });
  const text = card.textContent.replace(/\s+/g, ' ');
  expect(text).toContain('Daily');
  expect(text).not.toContain('Daily/13-06-26-13-16-01.md');
  expect(text).toContain('06/13');
});

test('NoteBoard показывает дату открытия в русском формате день-месяц', () => {
  locale.set('ru');
  render(NoteBoard, {
    mobile: true,
    notes: [{
      path: 'notes/Daily/13-06-26-13-16-01.md',
      name: '13-06-26-13-16-01',
      excerpt: 'Приветик, как ты, как сам',
      tags: [],
      lastOpened: '2026-06-13T13:16:01.000Z',
    }],
  });

  const card = screen.getByRole('button', { name: /13-06-26-13-16-01/ });
  const text = card.textContent.replace(/\s+/g, ' ');
  expect(text).toContain('13.06');
  expect(text).not.toContain('06/13');
});

test('NoteBoard показывает псевдо-карточку создания заметки первой', async () => {
  const { component } = render(NoteBoard, { notes, showCreateCard: true });
  const createNote = vi.fn();
  component.$on('createNote', createNote);

  const createCard = screen.getByRole('button', { name: /\+ New note/ });
  const alphaCard = screen.getByRole('button', { name: /Alpha/ });
  expect(createCard.compareDocumentPosition(alphaCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await fireEvent.click(createCard);
  expect(createNote).toHaveBeenCalledTimes(1);
});

test('NoteBoard сохраняет ручной порядок при перетаскивании без touch last_opened', async () => {
  render(NoteBoard, { notes });
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

  await fireEvent.dragStart(screen.getByRole('button', { name: /Beta/ }), { dataTransfer });
  await fireEvent.dragOver(screen.getByRole('button', { name: /Alpha/ }), { dataTransfer });
  await fireEvent.drop(screen.getByRole('button', { name: /Alpha/ }), { dataTransfer });

  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/notes/reorder', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ paths: ['notes/Work/Beta.md', 'notes/Work/Alpha.md'] }),
  })));
  expect(fetch).not.toHaveBeenCalledWith('/api/notes/touch?path=notes%2FWork%2FBeta.md', expect.anything());
});

test('NoteBoard догружает начало контента, если recent excerpt служебный', async () => {
  render(NoteBoard, {
    notes: [{ ...notes[1], excerpt: 'Last opened: 20260603T13:10' }],
  });

  expect(screen.queryByText(/Last opened/)).toBeNull();
  await waitFor(() => expect(screen.getByText(/Beta body start for the board card/)).toBeTruthy());
});

test('NoteBoard отключает перетаскивание в глобальных результатах поиска', () => {
  render(NoteBoard, { notes, query: 'alpha', highlight: true });

  expect(screen.getByRole('button', { name: /Alpha/ }).draggable).toBe(false);
  expect(screen.getByRole('button', { name: /Beta/ }).draggable).toBe(false);
});
