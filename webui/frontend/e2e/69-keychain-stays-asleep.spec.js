import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// On macOS the keychain asks for the login password the first time a changed app reads the stored GitHub token, and
// the whole app waits behind that dialog (the backend lives in the main process). So the token is read only where it
// is used: opening the app, the board and Settings must not ask for it, the sync part may.
test('открытие приложения и настроек не просит токен GitHub; он нужен только блоку синхронизации', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.request.post('/api/settings', { data: { git_token: 'ghp_fake_e2e_token' } });
  const asked = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/settings/secret') || url.includes('token=')) asked.push(url);
  });
  await page.route('**/api/git/repos**', (route) => route.fulfill({ json: ['alice/notes'] }));
  await page.route('**/api/git/branches**', (route) => route.fulfill({ json: ['main'] }));

  try {
    const settings = await (await page.request.get('/api/settings')).json();
    expect(settings.git_token_set).toBe(true);
    expect(settings.git_token).toBeUndefined();

    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(\+\s*)?New note$/i }).first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked, 'the board asked for no secret').toEqual([]);

    await page.goto('/settings');
    // Signed in from the flag alone, with the token still unread.
    await expect(page.getByTestId('sync-section').getByRole('button', { name: 'Reset' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked, 'Settings asked for no secret before the sync part was in view').toEqual([]);

    await page.locator('#settings-sync').scrollIntoViewIfNeeded();
    await expect.poll(() => asked.some((url) => url.includes('/api/settings/secret'))).toBe(true);
    await expect(page.getByLabel('Repository')).toContainText('alice/notes');
  } finally {
    await page.request.post('/api/settings', { data: { git_token: null } });
  }
});
