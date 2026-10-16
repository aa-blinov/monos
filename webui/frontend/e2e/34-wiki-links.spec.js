import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

test('ссылка [[…]] в редакторе: видна как ссылка, открывает заметку и создаёт недостающую, файл не меняется', async ({ page }) => {
  await prepareMonos(page);
  const target = uniqueTitle('Link Target');
  const missing = uniqueTitle('Not Yet');
  const source = uniqueTitle('Link Source');
  await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'Цель ссылки' } });
  const content = `См. [[${target}]] и [[${missing}]].`;
  const created = await page.request.post('/api/notes/create', { data: { title: source, category: '', tags: [], content } });
  const sourcePath = (await created.json()).path;

  await openNote(page, source);
  const found = page.locator('.ProseMirror .wiki-link-found', { hasText: target });
  const absent = page.locator('.ProseMirror .wiki-link-missing', { hasText: missing });
  await expect(found).toBeVisible();
  await expect(absent).toBeVisible();

  // A plain click only places the caret: the link text stays editable, and the bar under it offers to open.
  const sourceUrl = page.url();
  await found.click();
  const bar = page.getByTestId('wiki-link-bar');
  await expect(bar.getByRole('button', { name: new RegExp(`Open “${target}”`) })).toBeVisible();
  expect(page.url()).toBe(sourceUrl);
  await bar.getByRole('button', { name: new RegExp(`Open “${target}”`) }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(target);

  // Ctrl/⌘+click opens at once.
  await page.goBack();
  await expect(found).toBeVisible();
  await found.click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(target);

  // A link that leads nowhere creates its note.
  await page.goBack();
  await absent.click();
  await page.getByTestId('wiki-link-bar').getByRole('button', { name: new RegExp(`Create note “${missing}”`) }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(missing);

  const saved = (await (await page.request.get(`/api/file?path=${encodeURIComponent(sourcePath)}`)).json()).content;
  expect(saved).toContain(content);
});
