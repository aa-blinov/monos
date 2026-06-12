import { test, expect } from '@playwright/test';
import { createBlankNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page, { editMode: 'source' });
});

test('opens seeded notes and navigates through the shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Monos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Welcome/i })).toBeVisible();

  await page.getByRole('button', { name: /Welcome/i }).first().click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
  await expect(page.getByText(/Welcome to Monos/i)).toBeVisible();

  await page.getByRole('button', { name: 'Monos' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Open a note from the sidebar/i)).toBeVisible();
});

test('creates a blank note and persists source edits', async ({ page }) => {
  const title = uniqueTitle('Release Smoke Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  const textarea = page.locator('textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill(`This note was created by Playwright.\n\nrelease-smoke-token-${title}`);

  await waitForSavedContent(page, notePath, 'release-smoke-token');
  await page.reload();
  await expect(page.locator('textarea')).toHaveValue(/release-smoke-token/);
});

test('changes settings and persists them through the backend', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.locator('#font-size').selectOption('large');
  await page.locator('#editor-font-size').selectOption('lg');
  await page.locator('#default-mode').selectOption('rich');
  await page.locator('#interface-language').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await page.locator('#interface-language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await expect.poll(async () => {
    const response = await page.request.get('/api/settings');
    return response.ok() ? await response.json() : {};
  }).toMatchObject({
    fontSize: 'large',
    editorFontSize: 'lg',
    editMode: 'rich',
    locale: 'en',
  });
});

test('board mode is a full-width quick preview workspace', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Welcome/i }).first().click();
  await expect(page).toHaveURL(/\/notes\/Welcome/);

  await page.getByRole('button', { name: 'Board view' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Monos Board' })).toBeVisible();
  await expect(page.getByText('Tree', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '4 columns' }).click();
  await page.getByRole('button').filter({ hasText: 'Welcome.md' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Welcome to Monos.');
  await dialog.getByRole('button', { name: 'Open note' }).click();

  await expect(page).toHaveURL(/\/notes\/Welcome/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
});
