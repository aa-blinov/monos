import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('вкладка называет страницу, а заметка называется по заголовку', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Monos');
  for (const [route, title] of [['/settings', 'Settings — Monos'], ['/trash', 'Trash — Monos'], ['/favorites', 'Favorites — Monos'], ['/attachments', 'Attachments — Monos'], ['/properties', 'Notes table — Monos'], ['/help', 'Help — Monos']]) {
    await page.goto(route);
    await expect(page).toHaveTitle(title);
  }
  await page.goto('/no/such/page');
  await expect(page).toHaveTitle('Page not found — Monos');

  const name = `Titled ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title: name, category: 'Land', tags: [], content: '# Body heading\n\ntext\n' } })).json();
  await page.goto(`/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`);
  await expect(page).toHaveTitle(`${name} — Monos`);
});

test('на странице заметки один заголовок первого уровня: заголовок заметки', async ({ page }) => {
  const name = `One H1 ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title: name, category: 'Land', tags: [], content: '# Body heading\n\ntext\n\n## Second\n' } })).json();
  await page.goto(`/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`);
  await expect(page.getByTestId('rich-editor-input').getByText('Body heading')).toBeVisible();
  // `h1` elements count, and so does anything that says it is level 1.
  const levelOnes = await page.evaluate(() => [...document.querySelectorAll('h1, [role=heading]')]
    .filter((node) => (node.getAttribute('aria-level') || (node.tagName === 'H1' ? '1' : '')) === '1').length);
  expect(levelOnes).toBe(1);
});

test('на страницах с шапкой внутри страницы один баннер', async ({ page }) => {
  for (const route of ['/properties', '/attachments', '/favorites']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.locator('main header').count()).toBe(0);
    expect(await page.getByRole('banner').count()).toBe(1);
  }
});
