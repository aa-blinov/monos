import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('переименование в дереве переписывает [[ссылку]] в открытой заметке и не откатывает её при сохранении', async ({ page }) => {
  await prepareMonos(page);
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const target = `Rename Target ${stamp}`;
  const renamed = `Renamed Target ${stamp}`;
  const source = `Rename Source ${stamp}`;

  await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'Цель.' } });
  const created = await page.request.post('/api/notes/create', {
    data: { title: source, category: '', tags: [], content: `Ссылка: [[${target}]].` },
  });
  const sourcePath = (await created.json()).path;
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(sourcePath)}`)).json()).content;

  await page.goto('/');
  await page.locator('main').getByRole('button', { name: new RegExp(`^${source}`) }).first().click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible();

  // The source note stays open while the target is renamed from the tree.
  await page.getByTestId('tree-drop-zone').getByText(target, { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('dialog').locator('#rename-input').fill(renamed);
  await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();

  await expect(page.getByText('Links updated: 1')).toBeVisible();
  // The open note reloads the rewritten link from disk.
  await expect(page.locator('.ProseMirror').first()).toContainText(renamed);

  // Typing now autosaves the open note; the saved text must keep the rewritten link.
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' дописано');
  await expect.poll(savedContent).toContain('дописано');
  const saved = await savedContent();
  expect(saved).toContain(`[[${renamed}]]`);
  expect(saved).not.toContain(`[[${target}]]`);
});
