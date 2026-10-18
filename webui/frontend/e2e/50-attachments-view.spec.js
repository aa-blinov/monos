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

function bigVault(count) {
  const folders = ['Work/Alpha', 'Personal'];
  return Array.from({ length: count }, (_, i) => ({
    path: `notes/${folders[i % 2]}/_attachments/file-${String(i).padStart(3, '0')}.${i % 10 === 0 ? 'pdf' : 'png'}`,
    name: `file-${String(i).padStart(3, '0')}.${i % 10 === 0 ? 'pdf' : 'png'}`,
    kind: i % 10 === 0 ? 'pdf' : 'image',
    folder: folders[i % 2],
    size: 1000 + i * 100,
    modified: new Date(Date.now() - i * 3600000).toISOString(),
    usedBy: i % 3 === 0 ? [] : [{ path: `notes/${folders[i % 2]}/N${i}.md`, title: `Note ${i}` }],
  }));
}

async function openPage(page, items, extra = async () => {}) {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.route('**/api/attachments/all', (route) => route.fulfill({ json: { lockedNotes: 0, items } }));
  await extra();
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachment-card').first()).toBeVisible();
}

// A large vault is drawn in pages, sorted, and narrowed by type and folder; the choices are kept.
test('вложения: страницы по 60, сортировка, тип и папка', async ({ page }) => {
  await openPage(page, bigVault(200));
  await expect(page.getByTestId('attachment-card')).toHaveCount(60);
  await page.getByTestId('attachments-more').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(120);

  await page.getByTestId('attachments-sort').selectOption('name');
  await expect(page.getByTestId('attachment-card').first()).toContainText('file-000');
  await page.getByTestId('attachments-sort').selectOption('size');
  await expect(page.getByTestId('attachment-card').first()).toContainText('file-199');

  await page.getByTestId('attachments-kind').selectOption('pdf');
  await expect(page.getByTestId('attachments-count')).toContainText('20 of 200');
  await page.getByTestId('attachments-kind').selectOption('all');
  await page.getByTestId('attachments-folder').selectOption('Personal');
  await expect(page.getByTestId('attachments-count')).toContainText('100 of 200');

  // The sort is remembered.
  await page.reload();
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachments-sort')).toHaveValue('size');
});

// A click on a picture shows it large with every note that uses it.
test('вложения: просмотр картинки с заметками, копирование для заметки', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await openPage(page, bigVault(12));
  await page.getByTestId('attachments-sort').selectOption('name');
  await page.getByTestId('attachment-open').nth(1).click();
  const viewer = page.getByTestId('attachment-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId('attachment-viewer-notes').getByRole('button')).toHaveCount(1);
  await page.getByTestId('attachment-copy').click();
  await expect(page.getByTestId('attachment-copy')).toHaveText('Copied');
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
});

// Unused files are chosen, sent to the local trash after a confirmation, and brought back with Undo.
test('вложения: выбор неиспользуемых, корзина с подтверждением и возврат', async ({ page }) => {
  let deleted = null;
  let restored = null;
  await openPage(page, bigVault(30), async () => {
    await page.route('**/api/attachments/delete', async (route) => {
      deleted = JSON.parse(route.request().postData()).paths;
      await route.fulfill({ json: { batch: '1-abc', deleted: deleted.length, bytes: 5000, skipped: { used: 0, missing: 0 } } });
    });
    await page.route('**/api/attachments/restore', async (route) => {
      restored = JSON.parse(route.request().postData()).batch;
      await route.fulfill({ json: { restored: deleted.length } });
    });
  });
  await page.getByTestId('attachments-select').click();
  await page.getByTestId('attachments-select-unused').click();
  await expect(page.getByTestId('attachments-selected')).toContainText('10 selected');
  await page.getByTestId('attachments-trash').click();
  await expect(page.getByTestId('attachments-selection-bar')).toContainText('Move 10 files');
  await page.getByTestId('attachments-confirm').click();
  await expect(page.getByTestId('attachments-notice')).toContainText('10 files moved to the trash');
  expect(deleted).toHaveLength(10);
  // Only files no note uses were sent.
  expect(deleted.every((path) => Number(/file-(\d+)/.exec(path)[1]) % 3 === 0)).toBe(true);
  await page.getByTestId('attachments-undo').click();
  await expect(page.getByTestId('attachments-notice')).toContainText('Restored');
  expect(restored).toBe('1-abc');
});

// The page is left and entered again: the search and the place in the list are still there.
test('вложения: поиск и положение в списке переживают переход в заметку', async ({ page }) => {
  await openPage(page, bigVault(40));
  await page.getByTestId('attachments-query').fill('file-0');
  await page.getByTestId('attachment-notes').first().getByRole('button').first().click();
  await expect(page.getByTestId('attachments-view')).toHaveCount(0);
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachments-query')).toHaveValue('file-0');
});
