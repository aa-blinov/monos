import { expect, test } from '@playwright/test';
import { openBoardCard, prepareMonos } from './support/monos.js';

const scaleViewports = [
  { name: 'electron-minimum', width: 360, height: 640 },
  { name: 'narrow-phone', width: 390, height: 700 },
  { name: 'short-laptop', width: 1024, height: 600 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 2560, height: 1440 },
];

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
    };
  });

  expect(metrics.scrollWidth - metrics.viewportWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(4);
}

async function openWelcomeNote(page) {
  await openBoardCard(page, 'Welcome', 'notes/Welcome.md');
}

test.describe('application scale boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await prepareMonos(page);
    await page.addInitScript(() => {
      localStorage.setItem('noteView', 'board');
      localStorage.setItem('boardColumns', '3');
    });
  });

  for (const viewport of scaleViewports) {
    test(`does not break layout at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      if (viewport.width >= 1024) {
        await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Notes' })).toHaveCount(0);
      }
      await expect(page.getByRole('button', { name: /New note/i })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await openWelcomeNote(page);
      await expect(page.getByTestId('rich-editor-input')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      await expect(page.locator('#font-size')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
