import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// "Attachments" sits in the sidebar's bottom menu: every picture and PDF in a grid, a click on a card's note opens
// it, and "Unused" narrows the grid to the files nothing points at.
test('вложения: пункт внизу слева, сетка файлов, фильтр «Неиспользуемые»', async ({ page }, testInfo) => {
  await prepareMonos(page);
  const png = { path: 'notes/Docs/_attachments/a.png', name: 'a.png', kind: 'image', folder: 'notes/Docs', size: 2048, modified: new Date().toISOString() };
  await page.route('**/api/attachments/all', (route) => route.fulfill({
    json: {
      lockedNotes: 0,
      items: [
        { ...png, usedBy: [{ path: 'notes/Docs/Plan.md', title: 'Plan' }] },
        { ...png, path: 'notes/Docs/_attachments/b.png', name: 'b.png', usedBy: [] },
        { ...png, path: 'notes/Docs/_attachments/c.pdf', name: 'c.pdf', kind: 'pdf', usedBy: [{ path: 'notes/Docs/Plan.md', title: 'Plan' }] },
      ],
    },
  }));
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('attachments.png') });
  await page.getByTestId('attachments-filter-unused').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(1);
  await expect(page.getByTestId('attachment-unused')).toBeVisible();
  await page.getByTestId('attachments-filter-all').click();
  await page.getByTestId('attachments-query').fill('c.pdf');
  await expect(page.getByTestId('attachment-card')).toHaveCount(1);
});

test('шрифт: в настройках есть системный, и он применяется', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => localStorage.setItem('fontFamily', 'System'));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--font-family'))).toMatch(/^system-ui/);
});
