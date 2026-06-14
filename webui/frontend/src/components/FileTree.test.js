import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import { NOTE_LINK_DRAG_TYPE } from '../lib/drag-data.js';
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

test('FileTree показывает tooltip с полным именем файла на hover', async () => {
  render(FileTree, {
    node: {
      path: 'notes/Work/Very Long Research Note Name.md',
      name: 'Very Long Research Note Name.md',
      is_dir: false,
    },
  });

  await fireEvent.mouseEnter(screen.getByRole('button', { name: 'Very Long Research Note Name' }));

  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toBeTruthy();
  expect(tooltip.textContent).toContain('Very Long Research Note Name');
  expect(screen.queryByText('Work/Very Long Research Note Name.md')).toBeNull();

  await fireEvent.mouseLeave(screen.getByRole('button', { name: 'Very Long Research Note Name' }));
  expect(screen.queryByRole('tooltip')).toBeNull();
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
