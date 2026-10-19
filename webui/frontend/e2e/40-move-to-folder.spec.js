import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

// The folder button in a note's bottom bar is the note's real folder: it shows the whole path to the note and moves it.
test('кнопка папки показывает путь до заметки и переносит её, в том числе в новую папку', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Move Me');
  const folder = `Archive ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'Текст.' } });

  await openNote(page, title);
  const button = page.getByTestId('property-category-button');
  // At the top the path is the note itself.
  await expect(button).toContainText(title);
  await expect(button).not.toContainText('No folder');

  await button.click();
  const field = page.getByTestId('property-category');
  await field.fill(folder);
  await field.press('Enter');

  await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(folder)}/${encodeURIComponent(title)}\\.md$`));
  await expect(page.getByTestId('property-category-button')).toContainText(`${folder} / ${title}`);
  const tree = JSON.stringify(await (await page.request.get('/api/tree')).json());
  expect(tree).toContain(`notes/${folder}/${title}.md`);

  // And back out of it.
  await page.getByTestId('property-category-button').click();
  await page.getByTestId('property-category').fill('No folder');
  await page.getByTestId('property-category').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/notes/${encodeURIComponent(title)}\\.md$`));
});
