import { test, expect } from '@playwright/test';
import {
  createBlankNote,
  dropTinyImage,
  editorBody,
  fillEditor,
  prepareMonos,
  uniqueTitle,
  waitForSavedContent,
} from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('finds a newly saved note through global search', async ({ page }) => {
  const title = uniqueTitle('Search Integration');
  const token = `release-search-${Date.now()}`;
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await fillEditor(page, `Searchable body from Playwright.\n\n${token}`);
  await waitForSavedContent(page, notePath, token);

  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByPlaceholder('Search').fill(token);
  const result = page.locator('main').getByRole('button', { name: new RegExp(`^${title}\\b`) });
  await expect(result).toBeVisible();
  await expect(result).toContainText(token.replaceAll('-', ''));
});

test('inserts an image attachment, previews it, renames it, and updates markdown', async ({ page }) => {
  const title = uniqueTitle('Attachment Integration');
  const notePath = `notes/${title}.md`;
  const renamed = `release-attachment-${Date.now()}.webp`;

  await createBlankNote(page, title);
  await fillEditor(page, 'Attachment target note.');
  await dropTinyImage(page);

  const image = page.locator('img[data-attachment-path]').first();
  await expect(image).toBeVisible();
  await waitForSavedContent(page, notePath, '_attachments/');

  await image.click();
  await page.locator('[role="dialog"] input').fill(renamed);
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();

  await waitForSavedContent(page, notePath, `_attachments/${renamed}`);
  await expect(page.locator(`img[data-attachment-path$="${renamed}"]`)).toBeVisible();
});

test('creates a quick note from an image in the clipboard', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Create quick note from clipboard').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Quick note saved');
  await dialog.getByRole('button', { name: 'Open' }).click();

  await expect(page).toHaveURL(/Quick%20Notes/);
  await expect(editorBody(page)).toContainText('');
  await expect(page.locator('img[data-attachment-path*="_attachments/"]')).toBeVisible();
});
