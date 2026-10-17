import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('заметку можно создать без названия: она открывается как «Untitled» и сразу принимает текст', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^(\+ )?New note$/ }).first().click();
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
  await page.getByRole('button', { name: /^(\+ )?New note$/ }).first().click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.type('# Заголовок для оглавления');

  // The outline follows the text as it is typed; the save comes 1.25 s later and is not waited for.
  await expect(page.getByText('No headings yet')).toHaveCount(0, { timeout: 1000 });
});

test('в настройках первым идёт внешний вид, а в нём язык, а не резервные копии', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  await expect(page.locator('h2').first()).toHaveText('Appearance');
  await expect(page.locator('#settings-appearance #interface-language')).toBeVisible();
});

test('настройки: навигация по разделам переносит к ним и отмечает тот, что на экране', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  const nav = page.getByTestId('settings-nav');
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'true');

  await nav.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.locator('#settings-sync')).toBeInViewport();
  await expect(nav.getByRole('button', { name: 'Sync', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(nav.getByRole('button', { name: 'Appearance' })).not.toHaveAttribute('aria-current', 'true');

  await nav.getByRole('button', { name: 'Advanced' }).click();
  await expect(page.getByTestId('advanced-settings')).toHaveAttribute('open', '');
});

test('настройки: вместо длинной документации одна строка со ссылкой на справку', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  await expect(page.getByText('Keyboard', { exact: true })).toHaveCount(0);
  await page.getByTestId('settings-open-help').click();
  await expect(page).toHaveURL(/\/help$/);
});
