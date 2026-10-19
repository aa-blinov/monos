import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

test('заметка уходит в корзину без вопроса, и её можно вернуть из уведомления', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Undo Trash');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'Не теряй меня' } });

  await openNote(page, title);
  await page.getByTestId('footer-trash').click();

  const notice = page.getByRole('status').filter({ hasText: `“${title}” moved to the trash` });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
  await expect(notice).toHaveCount(0);
  const trash = await (await page.request.get('/api/notes/trash')).json();
  expect(JSON.stringify(trash)).not.toContain(title);
});

test('Ctrl/⌘+N открывает создание заметки откуда угодно', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('input[placeholder="Note Title"]').or(page.getByRole('dialog').getByRole('textbox')).first()).toBeFocused();
});

test('защита паролем открывается из меню «⋯», а не из свойств', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Lock Menu');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'Секрет' } });
  await openNote(page, title);

  await page.getByTestId('property-properties-button').click();
  await expect(page.locator('[data-panel="properties"]')).not.toContainText('Lock');
  await page.keyboard.press('Escape');

  await page.getByTestId('editor-more').click();
  await page.getByTestId('menu-lock').click();
  await expect(page.locator('[data-panel="lock"]')).toBeVisible();
});
