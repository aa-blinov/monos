import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('settings back button returns to dashboard', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Back to notes' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
});

test('sidebar tree opens a note from settings', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByTestId('tree-drop-zone').getByRole('button', { name: /Welcome/ }).click();

  await expect(page).toHaveURL(/\/notes\/Welcome\.md$/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
});

test('settings navigation remains clickable at compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('settings remains clickable after opening from compact sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page).toHaveURL(/\/$/);
});
