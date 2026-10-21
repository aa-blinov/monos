import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await prepareMonos(page);
});

/**
 * HTML5 drag-and-drop нельзя сделать настоящим мышиным жестом в headless, поэтому
 * события собираются вручную с настоящим DataTransfer — код читает из него
 * ровно то же, что и при живом перетаскивании.
 */
async function dragOnto(page, { sourceTitle, targetLabel }) {
  await page.evaluate(({ sourceTitle: title, targetLabel: label }) => {
    const cards = [...document.querySelectorAll('button')];
    const card = cards.find((node) => node.textContent?.includes(title) && node.draggable);
    const target = [...document.querySelectorAll('[data-testid="tree-drop-zone"] button')]
      .find((node) => node.textContent?.trim().includes(label));
    if (!card || !target) throw new Error(`Missing drag source "${title}" or folder "${label}"`);

    const dataTransfer = new DataTransfer();
    const at = (node, dx, dy) => {
      const rect = node.getBoundingClientRect();
      return { clientX: rect.left + dx, clientY: rect.top + dy };
    };

    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer, ...at(card, 8, 8) }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, ...at(target, 8, 8) }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, ...at(target, 8, 8) }));
    target.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer, ...at(target, 8, 8) }));
  }, { sourceTitle, targetLabel });
}

test('перетаскивание карточки доски на папку переносит файл', async ({ page }) => {
  const title = uniqueTitle('Board Drag');
  const folder = uniqueTitle('Board Drag Folder');

  const folderResponse = await page.request.post(`/api/directory/create?path=${encodeURIComponent(`notes/${folder}`)}`);
  expect(folderResponse.ok()).toBeTruthy();

  const noteResponse = await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: `# ${title}\n\nMoved by drag.` },
  });
  expect(noteResponse.ok()).toBeTruthy();
  const note = await noteResponse.json();

  await page.goto('/');
  await expect(page.getByText(title, { exact: false }).first()).toBeVisible();

  await dragOnto(page, { sourceTitle: title, targetLabel: folder });

  // Файл переехал: новый путь есть, старого нет, содержимое цело.
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/file?path=${encodeURIComponent(note.path)}`);
      return response.status();
    }, { timeout: 10000 })
    .toBe(404);

  const movedPath = `notes/${folder}/${note.name}`;
  const moved = await page.request.get(`/api/file?path=${encodeURIComponent(movedPath)}`);
  expect(moved.ok()).toBeTruthy();
  expect((await moved.json()).content).toContain('Moved by drag.');
});

test('перетаскивание закреплённой заметки на папку переносит файл', async ({ page }) => {
  const title = uniqueTitle('Pinned Drag');
  const folder = uniqueTitle('Pinned Drag Folder');

  const folderResponse = await page.request.post(`/api/directory/create?path=${encodeURIComponent(`notes/${folder}`)}`);
  expect(folderResponse.ok()).toBeTruthy();

  const noteResponse = await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: `# ${title}\n\nPinned.` },
  });
  expect(noteResponse.ok()).toBeTruthy();
  const note = await noteResponse.json();

  const pinResponse = await page.request.put(`/api/file/metadata?path=${encodeURIComponent(note.path)}`, { data: { pinned: true } });
  expect(pinResponse.ok()).toBeTruthy();
  await page.goto('/');

  const pinned = page.getByTestId('pinned-list').getByRole('button', { name: new RegExp(title) });
  await expect(pinned).toBeVisible();

  await page.evaluate(({ pinnedTitle, folderName }) => {
    const source = [...document.querySelectorAll('[data-testid="pinned-list"] button')]
      .find((node) => node.textContent?.includes(pinnedTitle));
    const target = [...document.querySelectorAll('[data-testid="tree-drop-zone"] button')]
      .find((node) => node.textContent?.trim().includes(folderName));
    if (!source || !target) throw new Error(`Missing pinned source or folder "${folderName}"`);

    const dataTransfer = new DataTransfer();
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { clientX: r.left + 8, clientY: r.top + 8 };
    };
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer, ...rect(source) }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, ...rect(target) }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, ...rect(target) }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer, ...rect(source) }));
  }, { pinnedTitle: title, folderName: folder });

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/file?path=${encodeURIComponent(note.path)}`);
      return response.status();
    }, { timeout: 10000 })
    .toBe(404);

  const moved = await page.request.get(`/api/file?path=${encodeURIComponent(`notes/${folder}/${note.name}`)}`);
  expect(moved.ok()).toBeTruthy();
});
