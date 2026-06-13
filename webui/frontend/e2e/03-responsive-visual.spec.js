import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openBoardCard, prepareMonos } from './support/monos.js';

const auditDir = path.resolve(process.env.E2E_VISUAL_AUDIT_DIR || 'e2e/artifacts/responsive-visual');

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small-mobile', width: 360, height: 740 },
];

test.beforeAll(() => {
  fs.rmSync(auditDir, { recursive: true, force: true });
  fs.mkdirSync(auditDir, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'board');
    localStorage.setItem('boardColumns', '3');
  });
});

async function screenshot(page, viewportName, stateName) {
  await page.screenshot({
    path: path.join(auditDir, `${viewportName}-${stateName}.png`),
    fullPage: true,
  });
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: documentElement.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      overflowX: Math.max(documentElement.scrollWidth, body.scrollWidth) - window.innerWidth,
    };
  });

  expect(metrics.overflowX, JSON.stringify(metrics)).toBeLessThanOrEqual(4);
}

async function expectCoreControlsVisible(page) {
  await expect(page.getByRole('button', { name: 'Open sidebar' })).toBeVisible();
  await expect(page.getByPlaceholder('Search')).toBeVisible();
}

async function openWelcomeNote(page) {
  await openBoardCard(page, 'Welcome', 'notes/Welcome.md');
  await page.waitForTimeout(350);
}

async function verifyBoardCardRecolor(page) {
  const card = page.locator('main').getByRole('button', { name: /^Welcome\b/ }).first();
  try {
    await card.click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();

    const colorResponse = page.waitForResponse((response) =>
      response.url().includes('/api/directory/icon') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Apply Aqua' }).click();
    await colorResponse;
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Group by color' }).click();
    await expect(page.getByText('Aqua')).toBeVisible();
  } finally {
    await page.request.post(`/api/directory/icon?path=${encodeURIComponent('notes/Welcome.md')}`, {
      data: { icon: null, color: null },
    });
  }
}

test.describe('responsive visual component audit', () => {
  for (const viewport of viewports) {
    test(`keeps core screens visually stable on ${viewport.name}`, async ({ page }) => {
      const isMobileLayout = viewport.width < 1024;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      await expectCoreControlsVisible(page);
      if (isMobileLayout) {
        await expect(page.getByRole('heading', { name: 'Notes' })).toHaveCount(0);
      } else {
        await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await screenshot(page, viewport.name, '01-home');

      await openWelcomeNote(page);
      await expect(page.getByTestId('rich-editor-input')).toBeVisible();
      await expect(page.getByRole('button', { name: /Switch editor mode/i })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await screenshot(page, viewport.name, '02-note-editor');

      await page.getByRole('button', { name: 'Back to notes' }).click();
      await expect(page).toHaveURL(/\/$/);
      const searchResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/search') && response.request().method() === 'POST'
      );
      await page.getByPlaceholder('Search').fill('release');
      await searchResponse;
      await expect(page.getByText('Search Results')).toBeVisible();
      await expect(page.locator('main').getByRole('button', { name: /Welcome/i }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, viewport.name, '03-search');

      await page.goto('/');
      if (isMobileLayout) {
        await page.getByRole('button', { name: 'Open sidebar' }).click();
        await expect(page.getByRole('button', { name: 'Close sidebar' }).nth(1)).toBeVisible();
        await page.waitForTimeout(350);
      } else {
        await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await screenshot(page, viewport.name, isMobileLayout ? '04-sidebar-overlay' : '04-board');
      if (!isMobileLayout) {
        await verifyBoardCardRecolor(page);
        await expectNoHorizontalOverflow(page);
      }

      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      await expect(page.locator('#font-size')).toBeVisible();
      await expect(page.locator('#editor-font-size')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, viewport.name, '05-settings');
    });
  }
});
