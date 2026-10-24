import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// A note name is free text. "#" and "?" cut an unencoded address short, and "%" made the router throw
// "URI malformed", so these notes could not be opened at all.
// ("what? yes" is covered by the address builder's unit test: the backend refuses "?" in a file name.)
const NAMES = ['C# notes', '100% done', 'a%2Fb', '#hash', 'x&y', 'ü ё 😀'];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareMonos(page);
});

for (const name of NAMES) {
  test(`заметка «${name}» открывается с доски и после перезагрузки`, async ({ page }) => {
    await page.request.post('/api/notes/create', { data: { title: name, category: 'Names', tags: [], content: `body of ${name}` } });
    await page.goto('/');
    const card = page.locator('main [role=list]').getByText(name, { exact: true }).first();
    await card.click();
    const title = page.locator('input[placeholder="Note Title"]');
    await expect(title).toHaveValue(name);
    // The address names this very note, and nothing leaked into the fragment or the query string.
    expect(new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).search).toBe('');
    await page.reload();
    await expect(title).toHaveValue(name);
    await expect(page.getByText(`body of ${name}`).first()).toBeVisible();
  });
}

test('адрес с битой процентной последовательностью открывает заметку, а не падает', async ({ page }) => {
  await page.request.post('/api/notes/create', { data: { title: '100% done', category: 'Names', tags: [], content: 'body' } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  // The dev server answers a broken sequence with an error page of its own; the packaged backend serves the app
  // (its SPA fallback is covered in the backend tests), so the app shell is handed over here.
  const shell = await (await page.request.get('/')).text();
  await page.route(/\/notes\/Names\/100%/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: shell }));
  await page.goto('/notes/Names/100%%20done.md');
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('100% done');
  expect(errors.filter((message) => /URI malformed/i.test(message))).toEqual([]);
});

test('поиск и палитра команд ведут по тому же адресу', async ({ page }) => {
  await page.request.post('/api/notes/create', { data: { title: 'C# notes', category: 'Names', tags: [], content: 'sharp body' } });
  await page.goto('/');
  await page.getByRole('searchbox').first().fill('C# notes');
  await page.getByRole('button', { name: /C# notes/ }).first().click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('C# notes');
  expect(new URL(page.url()).pathname).toContain('C%23%20notes.md');
});
