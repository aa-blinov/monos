import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// Everything a finger has to hit is 44px; the note's foot is one even row; a short screen keeps room for the text;
// the "moved to the trash" notice does not cover the sidebar's foot.
const SMALL_TARGETS = () => [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=switch], summary')]
  .filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.disabled && !el.closest('.sr-only') && cs.opacity !== '0'
      && r.bottom > 0 && r.top < innerHeight && !el.closest('[inert]');
  })
  .map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), name: el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.id || (el.textContent || '').trim().slice(0, 25) || el.tagName, tag: el.tagName };
  })
  // A text field is as tall as a line of input; the rule is about what is pressed.
  .filter((item) => Math.min(item.w, item.h) < 44 && !(item.tag === 'INPUT' && item.h >= 35));

async function makeNote(page, title, tags = ['alpha']) {
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Phone', tags, content: 'body text' } })).json();
  return `/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`;
}

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('на телефоне все нажимаемые элементы не меньше 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const route = await makeNote(page, `Targets ${Date.now()}`);
  for (const title of ['One', 'Two']) await page.request.post('/api/notes/create', { data: { title: `Phone ${title}`, category: 'Phone', tags: ['alpha', 'beta'], content: 'text' } });

  const small = {};
  await page.goto('/');
  await expect(page.getByTestId('board-tags-more')).toBeVisible();
  small.board = await page.evaluate(SMALL_TARGETS);
  await page.getByTestId('board-tags-more').click();
  small.tagsOpen = await page.evaluate(SMALL_TARGETS);
  await page.keyboard.press('Escape');

  await page.locator('main').getByRole('button', { name: /^Phone One/ }).first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  small.cardMenu = await page.evaluate(SMALL_TARGETS);
  await page.keyboard.press('Escape');

  await page.goto('/settings');
  await expect(page.getByTestId('storage-section')).toBeVisible();
  small.settings = await page.evaluate(SMALL_TARGETS);

  await page.goto(route);
  await expect(page.getByTestId('rich-editor-input')).toBeVisible();
  small.note = await page.evaluate(SMALL_TARGETS);
  await page.keyboard.press('Control+f');
  await expect(page.getByTestId('note-find')).toBeVisible();
  small.find = await page.evaluate(SMALL_TARGETS);

  expect(small).toEqual({ board: [], tagsOpen: [], cardMenu: [], settings: [], note: [], find: [] });
});

for (const [width, height] of [[390, 844], [360, 740], [390, 420]]) {
  test(`подвал заметки на ${width}x${height}: один ровный ряд значков по 44px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const route = await makeNote(page, `Foot ${Date.now()}`, ['a', 'b']);
    await page.goto(route);
    const footer = page.getByTestId('editor-footer');
    await expect(footer).toBeVisible();
    const boxes = await footer.evaluate((node) => [...node.querySelectorAll('button')]
      .map((button) => { const r = button.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), id: button.getAttribute('data-testid') }; })
      .filter((box) => box.w > 0 && box.h > 0));
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    // One row: every button on the same line, none wider or narrower than a finger, all inside the screen.
    expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
    for (const box of boxes) {
      expect(box.w, box.id).toBeGreaterThanOrEqual(44);
      expect(box.h, box.id).toBeGreaterThanOrEqual(44);
      expect(box.x + box.w, box.id).toBeLessThanOrEqual(width);
    }
    // Equal steps between neighbours inside each group (the left group and the right one).
    const steps = boxes.slice(1).map((box, index) => box.x - boxes[index].x);
    const left = steps.filter((step) => step <= 50);
    expect(Math.max(...left) - Math.min(...left)).toBeLessThanOrEqual(1);
  });
}

test('на низком телефоне 390x420 тексту остаётся не меньше 55% высоты', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  const route = await makeNote(page, `Short ${Date.now()}`);
  await page.goto(route);
  const surface = page.getByTestId('rich-editor-surface');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(420 * 0.55);
});

test('уведомление «в корзину» не закрывает подвал боковой панели', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const route = await makeNote(page, `Toast ${Date.now()}`);
  await page.goto(route);
  await page.getByTestId('footer-trash').click();
  const notice = page.getByTestId('notices');
  await expect(notice).toBeVisible();
  const noticeBox = await notice.locator('[role=status]').first().boundingBox();
  for (const name of ['open-more']) {
    const box = await page.getByTestId(name).boundingBox();
    const overlaps = box && noticeBox.x < box.x + box.width && noticeBox.x + noticeBox.width > box.x && noticeBox.y < box.y + box.height && noticeBox.y + noticeBox.height > box.y;
    expect(overlaps, name).toBeFalsy();
  }
  const settings = await page.getByRole('button', { name: 'Settings', exact: true }).last().boundingBox();
  expect(noticeBox.x + noticeBox.width <= settings.x || noticeBox.x >= settings.x + settings.width || noticeBox.y + noticeBox.height <= settings.y).toBe(true);
});
