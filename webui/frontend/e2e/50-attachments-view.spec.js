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

// Every note that uses a file is reachable from its card: two are shown, the rest open with one click.
test('вложения: у файла в нескольких заметках видны все, остальные раскрываются', async ({ page }) => {
  await prepareMonos(page);
  const notes = ['One', 'Two', 'Three', 'Four'].map((title) => ({ path: `notes/Docs/${title}.md`, title }));
  await page.route('**/api/attachments/all', (route) => route.fulfill({
    json: {
      lockedNotes: 0,
      items: [{ path: 'notes/Docs/_attachments/shared.png', name: 'shared.png', kind: 'image', folder: 'notes/Docs', size: 4096, modified: new Date().toISOString(), usedBy: notes }],
    },
  }));
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  const list = page.getByTestId('attachment-notes');
  await expect(list.getByRole('button', { name: /^(One|Two|Three|Four)$/ })).toHaveCount(2);
  await page.getByTestId('attachment-more-notes').click();
  await expect(list.getByRole('button', { name: /^(One|Two|Three|Four)$/ })).toHaveCount(4);
});

// The list of unused files is no longer in Settings: only a way to the page.
test('настройки: вместо списка вложений ссылка на страницу «Вложения»', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  // The link sits in the collapsed "More" block: open it.
  await page.evaluate(() => document.querySelectorAll('details').forEach((el) => { if (el.querySelector('[data-testid="settings-open-attachments"]')) el.open = true; }));
  const link = page.getByTestId('settings-open-attachments');
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page.getByTestId('attachments-view')).toBeVisible();
  await expect(page.getByTestId('orphan-attachments')).toHaveCount(0);
});
