import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import { NOTE_LINK_DRAG_TYPE } from '../lib/drag-data.js';
import { installTooltips } from '../lib/tooltip.js';
import FileTree from './FileTree.svelte';

function createDataTransfer() {
  const store = new Map();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(type, value) {
      store.set(type, value);
    },
    getData(type) {
      return store.get(type) || '';
    },
  };
}

test('FileTree диспатчит navigate для файла', async () => {
  const { component } = render(FileTree, {
    node: {
      path: 'notes/Inbox.md',
      name: 'Inbox.md',
      is_dir: false,
    },
  });
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);

  await fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));

  expect(navigateHandler).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: { path: 'notes/Inbox.md', name: 'Inbox.md', isDir: false },
    })
  );
});

test('FileTree: полное имя заметки показывает общая подсказка, справа и только если имя обрезано', async () => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  const stop = installTooltips(document);
  render(FileTree, {
    node: {
      path: 'notes/Work/Very Long Research Note Name.md',
      name: 'Very Long Research Note Name.md',
      is_dir: false,
    },
  });
  const row = screen.getByRole('button', { name: 'Very Long Research Note Name' });
  expect(row.getAttribute('data-tooltip')).toBe('Very Long Research Note Name');
  expect(row.getAttribute('data-tooltip-position')).toBe('right');

  // jsdom has no layout: make the name look cut off.
  const name = row.querySelector('.truncate');
  Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 300 });
  Object.defineProperty(name, 'clientWidth', { configurable: true, value: 120 });
  await fireEvent.mouseOver(name);
  expect(screen.queryByRole('tooltip')).toBeNull();
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.getByRole('tooltip').textContent).toBe('Very Long Research Note Name');
  expect(screen.queryByText('Work/Very Long Research Note Name.md')).toBeNull();

  await fireEvent.mouseOut(row, { relatedTarget: document.body });
  expect(screen.queryByRole('tooltip')).toBeNull();

  // An uncut name needs no tooltip.
  Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 100 });
  await fireEvent.mouseOver(name);
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.queryByRole('tooltip')).toBeNull();
  stop();
  vi.useRealTimers();
});

test('title= на любом элементе показывается общей подсказкой, а системная не всплывает', async () => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  const stop = installTooltips(document);
  const button = document.createElement('button');
  button.title = 'Sync now';
  document.body.appendChild(button);

  await fireEvent.mouseOver(button);
  expect(button.hasAttribute('title')).toBe(false);
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.getByRole('tooltip').textContent).toBe('Sync now');
  expect(screen.getByRole('tooltip').className).toContain('uppercase');

  await fireEvent.pointerDown(button);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(button.getAttribute('title')).toBe('Sync now');
  button.remove();
  stop();
  vi.useRealTimers();
});

test('FileTree раскрывает папку и пробрасывает navigate от вложенного файла', async () => {
  const { component } = render(FileTree, {
    node: {
      path: 'notes/Work',
      name: 'Work',
      is_dir: true,
      children: [
        {
          path: 'notes/Work/Alpha.md',
          name: 'Alpha.md',
          is_dir: false,
        },
      ],
    },
  });
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);

  await fireEvent.click(screen.getByRole('button', { name: 'Work' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

  expect(navigateHandler).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
    })
  );
});

test('FileTree диспатчит rightClick с координатами и метаданными узла', async () => {
  const { component } = render(FileTree, {
    node: {
      path: 'notes/Projects',
      name: 'Projects',
      is_dir: true,
      children: [],
    },
  });
  const rightClickHandler = vi.fn();
  component.$on('rightClick', rightClickHandler);

  await fireEvent.contextMenu(screen.getByRole('button', { name: 'Projects' }), {
    clientX: 120,
    clientY: 80,
  });

  expect(rightClickHandler).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: {
        x: 120,
        y: 80,
        path: 'notes/Projects',
        name: 'Projects',
        isDir: true,
      },
    })
  );
});

test('FileTree диспатчит moveFile при переносе файла в папку', async () => {
  const { component } = render(FileTree, {
    node: {
      path: 'notes/Archive',
      name: 'Archive',
      is_dir: true,
      children: [],
    },
  });
  const moveHandler = vi.fn();
  component.$on('moveFile', moveHandler);
  const target = screen.getByRole('button', { name: 'Archive' });
  const dataTransfer = createDataTransfer();
  dataTransfer.setData('text/plain', 'notes/Inbox.md');

  await fireEvent.dragOver(target, { dataTransfer });
  await fireEvent.drop(target, { dataTransfer });

  expect(moveHandler).toHaveBeenCalledTimes(1);
  expect(moveHandler.mock.calls[0][0].detail).toEqual(expect.objectContaining({
    sourcePath: 'notes/Inbox.md',
    targetPath: 'notes/Archive',
  }));
});

test('FileTree добавляет payload для создания wiki-link при drag заметки', async () => {
  render(FileTree, {
    node: {
      path: 'notes/Daily/Inbox.md',
      name: 'Inbox.md',
      is_dir: false,
    },
  });
  const dataTransfer = createDataTransfer();

  await fireEvent.dragStart(screen.getByRole('button', { name: 'Inbox' }), { dataTransfer });

  expect(dataTransfer.getData('text/plain')).toBe('notes/Daily/Inbox.md');
  expect(JSON.parse(dataTransfer.getData(NOTE_LINK_DRAG_TYPE))).toEqual({
    path: 'notes/Daily/Inbox.md',
    name: 'Inbox',
  });
  expect(dataTransfer.effectAllowed).toBe('copyMove');
});

test('FileTree подкрашивает фон активной заметки её цветом', () => {
  const { component } = render(FileTree, {
    selectedPath: 'notes/Colored.md',
    node: {
      path: 'notes/Colored.md',
      name: 'Colored.md',
      is_dir: false,
      color: '#8ec07c',
    },
  });

  const button = screen.getByRole('button', { name: 'Colored' });
  const style = button.getAttribute('style') || '';
  // Фон подкрашен цветом заметки (микс с прозрачным)
  expect(style).toContain('background');
  expect(style).toContain('#8ec07c');
  expect(style).toContain('--tree-color: #8ec07c');
});

test('FileTree не красит фон неактивной заметки, даже если у неё есть цвет', () => {
  render(FileTree, {
    selectedPath: 'notes/Other.md',
    node: {
      path: 'notes/Colored.md',
      name: 'Colored.md',
      is_dir: false,
      color: '#8ec07c',
    },
  });

  const button = screen.getByRole('button', { name: 'Colored' });
  const style = button.getAttribute('style') || '';
  // CSS-переменная с цветом может быть, но фон не должен быть подкрашен
  expect(style).not.toContain('background');
});

test('FileTree не ставит цвет в стиль, когда node.color не задан', () => {
  render(FileTree, {
    selectedPath: 'notes/Plain.md',
    node: {
      path: 'notes/Plain.md',
      name: 'Plain.md',
      is_dir: false,
    },
  });

  const button = screen.getByRole('button', { name: 'Plain' });
  const style = button.getAttribute('style') || '';
  expect(style).not.toContain('--tree-color');
  expect(style).not.toContain('background:');
});

test('FileTree не использует вертикальную полоску слева', () => {
  render(FileTree, {
    selectedPath: 'notes/Colored.md',
    node: {
      path: 'notes/Colored.md',
      name: 'Colored.md',
      is_dir: false,
      color: '#8ec07c',
    },
  });

  const button = screen.getByRole('button', { name: 'Colored' });
  // Никакой border-l: полоска не рисуется вовсе.
  expect(button.className).not.toContain('border-l');
});
