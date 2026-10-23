import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

async function openHelp(page, url = '/help') {
  await prepareMonos(page);
  await page.goto(url);
  await expect(page.getByTestId('help-view')).toBeVisible();
}

const inView = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const box = el?.getBoundingClientRect();
  return Boolean(box && box.top < window.innerHeight && box.bottom > 0);
}, id);

// Sections on the left list their topics once open; a topic is one click away and has an address.
test('справка: у раздела список тем, клик ведёт к теме, адрес запоминается', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openHelp(page);
  await page.getByTestId('help-section').filter({ hasText: 'Organising' }).first().click();
  await expect(page.getByTestId('help-topics')).toBeVisible();
  await page.getByTestId('help-topic').filter({ hasText: 'Attachments' }).click();
  await expect.poll(() => inView(page, 'help-organize-attachments')).toBe(true);
  expect(page.url()).toContain('topic=organize%2Fattachments');
});

test('справка: адрес с ?topic= открывает нужную тему сразу', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openHelp(page, '/help?topic=settings/look');
  await expect.poll(() => inView(page, 'help-settings-look')).toBe(true);
  await expect(page.getByTestId('help-topic').filter({ hasText: 'Appearance' })).toHaveAttribute('aria-current', 'true');
});

// On a phone there is no list at the side: the sections are chips in a row under the search.
test('справка на телефоне: разделы чипами под поиском, клик ведёт к разделу', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHelp(page);
  await expect(page.getByTestId('help-chips')).toBeVisible();
  const chips = page.getByTestId('help-chip');
  expect(await chips.count()).toBeGreaterThan(5);
  await chips.nth(3).click();
  await expect(chips.nth(3)).toHaveAttribute('aria-current', 'true');
  const first = await chips.nth(0).boundingBox();
  expect(first.height).toBeGreaterThanOrEqual(40);
});

test('справка: новые темы находятся поиском, «/» ставит курсор в поиск, Esc очищает, «Наверх» в конце раздела возвращает к началу', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openHelp(page);
  await page.getByTestId('help-search').blur();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(page.getByTestId('help-search')).toBeFocused();
  for (const word of ['attachments', 'favorites', 'tabs', 'Joplin']) {
    await page.getByTestId('help-search').fill(word);
    await expect(page.getByTestId('help-results').getByRole('button').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help-search')).toHaveValue('');
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="help-view"]');
    const scrolling = [root, ...root.querySelectorAll('div')].find((el) => el.scrollHeight > el.clientHeight + 100 && getComputedStyle(el).overflowY === 'auto');
    scrolling.scrollTop = 3000;
  });
  await page.getByTestId('help-top').nth(3).scrollIntoViewIfNeeded();
  await page.getByTestId('help-top').nth(3).click();
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('[data-testid="help-view"]');
    return Math.max(...[root, ...root.querySelectorAll('div')].filter((el) => getComputedStyle(el).overflowY === 'auto').map((el) => el.scrollTop));
  })).toBeLessThan(5);
});

test('справка: те же темы по-русски, искать можно по русским словам', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => localStorage.setItem('locale', 'ru'));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/help');
  for (const word of ['вложения', 'избранное', 'табы', 'импорт']) {
    await page.getByTestId('help-search').fill(word);
    await expect(page.getByTestId('help-results').getByRole('button').first()).toBeVisible();
  }
});

// On a phone the header scrolls away with the page: the topics get the screen, and the section chips stay at the top.
test('справка на телефоне: шапка прокручивается вместе со страницей, чипы разделов остаются сверху', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHelp(page);
  const chips = page.getByTestId('help-chips');
  await page.getByTestId('help-chip').nth(2).click();
  await page.waitForTimeout(900);
  const box = await chips.boundingBox();
  expect(box.y).toBeLessThan(90);
  const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(heading === null || heading.y + heading.height < 10).toBe(true);
});
