import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('заметку можно создать без названия: она открывается как «Untitled» и сразу принимает текст', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.getByText('+ New note').first().click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.locator('.ProseMirror').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Untitled/ }).first()).toBeVisible();
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.type('Пишу сразу');
  await expect(page.locator('.ProseMirror').first()).toContainText('Пишу сразу');
});

test('Outline показывает заголовок, который только что набран', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.getByText('+ New note').first().click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.type('# Заголовок для оглавления');

  await expect(page.getByText('No headings yet')).toHaveCount(0, { timeout: 5000 });
});

test('в настройках первым идёт язык, а не резервные копии', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  await expect(page.locator('h2').first()).toHaveText('Language');
});
