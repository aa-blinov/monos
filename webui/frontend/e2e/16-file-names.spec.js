import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '+ New' }).first()).toBeVisible({ timeout: 20000 });
});

test('название с двоеточием не принимается до отправки: подсказка и кнопка заблокирована', async ({ page }) => {
  await page.getByRole('button', { name: '+ New' }).first().click();
  const title = page.locator('#create-note-title');
  const create = page.getByRole('button', { name: 'Create', exact: true });

  await title.fill('Plan: Q4');
  await expect(page.getByRole('alert')).toContainText('not allowed in names');
  await expect(create).toBeDisabled();

  await title.fill('Plan Q4');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(create).toBeEnabled();
});

test('сервер отказывает в имени с недопустимым символом, даже если форму обошли', async ({ page }) => {
  const response = await page.request.post('/api/notes/create', {
    data: { title: 'Plan: Q4', category: '', tags: [], content: '' },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).detail).toContain('must not contain these characters');
});
