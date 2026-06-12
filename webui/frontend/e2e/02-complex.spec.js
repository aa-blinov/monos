import { test, expect } from '@playwright/test';
import {
  createBlankNote,
  dropTinyImage,
  prepareMonos,
  uniqueTitle,
  waitForSavedContent,
} from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page, { editMode: 'source' });
});

test('finds a newly saved note through global search', async ({ page }) => {
  const title = uniqueTitle('Search Integration');
  const token = `release-search-${Date.now()}`;
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await page.locator('textarea').fill(`Searchable body from Playwright.\n\n${token}`);
  await waitForSavedContent(page, notePath, token);

  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByPlaceholder('Search').fill(token);
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.locator('mark', { hasText: token })).toBeVisible();
});

test('inserts an image attachment, previews it, renames it, and updates markdown', async ({ page }) => {
  const title = uniqueTitle('Attachment Integration');
  const notePath = `notes/${title}.md`;
  const renamed = `release-attachment-${Date.now()}.webp`;

  await createBlankNote(page, title);
  await page.locator('textarea').fill('Attachment target note.');
  await dropTinyImage(page);

  await expect(page.locator('img.attachment-image')).toBeVisible();
  await waitForSavedContent(page, notePath, '_attachments/');

  await page.locator('img.attachment-image').first().click();
  await page.locator('[role="dialog"] input').fill(renamed);
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();

  await waitForSavedContent(page, notePath, `_attachments/${renamed}`);
  await expect(page.locator('textarea')).toHaveValue(new RegExp(`_attachments/${renamed}`));
});

test('creates a quick note from an image in the clipboard', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Create quick note from clipboard').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Quick note saved');
  await dialog.getByRole('button', { name: 'Open' }).click();

  await expect(page).toHaveURL(/Quick%20Notes/);
  await expect(page.locator('textarea')).toHaveValue(/!\[image-.*\]\(_attachments\/.*\.(webp|png)\)/);
});
