import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The packaged app opens on a random port, so its origin (and the browser's localStorage with it) is new on every
// launch. The ordinary preferences live in the server's settings too, and come back from there.
test('ширина текста и интервал сохраняются на сервере и возвращаются на пустом localStorage', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const before = await (await page.request.get('/api/settings')).json();
  try {
    await page.goto('/settings');
    await page.locator('#content-width').selectOption('broad');
    await page.locator('#line-height').selectOption('relaxed');
    await expect.poll(async () => {
      const settings = await (await page.request.get('/api/settings')).json();
      return `${settings.contentWidth}/${settings.lineHeight}`;
    }).toBe('broad/relaxed');

    // A new origin: the browser's own copy is gone.
    await page.evaluate(() => { localStorage.removeItem('contentWidth'); localStorage.removeItem('lineHeight'); });
    await page.goto('/settings');
    await expect(page.locator('#content-width')).toHaveValue('broad');
    await expect(page.locator('#line-height')).toHaveValue('relaxed');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('contentWidth'))).toBe('broad');
  } finally {
    await page.request.post('/api/settings', { data: { contentWidth: before.contentWidth ?? 'medium', lineHeight: before.lineHeight ?? 'normal' } });
  }
});

test('выбор из localStorage, которого нет на сервере, уезжает на сервер при запуске', async ({ page }) => {
  await prepareMonos(page);
  const posted = [];
  await page.route('**/api/settings', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      posted.push(request.postDataJSON());
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.fulfill({ json: { theme: 'gruvbox', themeMode: 'dark' } });
    }
  });
  await page.addInitScript(() => localStorage.setItem('boardSort', 'title'));
  await page.goto('/');
  await expect.poll(() => posted.some((payload) => payload.boardSort === 'title')).toBe(true);
});
