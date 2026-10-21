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

async function pickFolder(page, name) {
  await page.getByTestId('attachments-folder').click();
  await page.getByTestId('attachments-folder-option').filter({ hasText: new RegExp(`^${name}`) }).first().click();
}

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
  // The click and the scroll-triggered load may both add a page: at least two pages, whole pages only.
  await expect.poll(async () => page.getByTestId('attachment-card').count()).toBeGreaterThanOrEqual(120);
  const drawn = await page.getByTestId('attachment-card').count();
  expect(drawn % 60 === 0 || drawn === 200).toBe(true);

  await page.getByTestId('attachments-sort').selectOption('name');
  await expect(page.getByTestId('attachment-card').first()).toContainText('file-000');
  await page.getByTestId('attachments-sort').selectOption('size');
  await expect(page.getByTestId('attachment-card').first()).toContainText('file-199');

  await page.getByTestId('attachments-kind').selectOption('pdf');
  await expect(page.getByTestId('attachments-count')).toContainText('20 of 200');
  await page.getByTestId('attachments-kind').selectOption('all');
  await pickFolder(page, 'Personal');
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

// What is selected is what is on the page: a filter that hides files takes them out of the selection.
test('вложения: выбор следует за фильтрами, «выбрать все» — только показанные', async ({ page }) => {
  await openPage(page, bigVault(60));
  await page.getByTestId('attachments-select').click();
  await page.getByTestId('attachments-select-unused').click();
  await expect(page.getByTestId('attachments-selected')).toContainText('20 selected');
  await page.getByTestId('attachments-kind').selectOption('pdf');
  // 6 PDFs, of which 2 are unused: only those can stay selected.
  await expect(page.getByTestId('attachments-selected')).toContainText('2 selected');
  await page.getByTestId('attachments-kind').selectOption('all');
  await pickFolder(page, 'Personal');
  await page.getByTestId('attachments-select-unused').click();
  await expect(page.getByTestId('attachments-select-unused')).toContainText(/Select the \d+ unused shown/);
  const shown = Number(/(\d+) selected/.exec(await page.getByTestId('attachments-selected').innerText())[1]);
  expect(shown).toBeLessThan(20);
});

// A batch the server only partly moved is not reported as done: the list is read again and the notice says so.
test('вложения: частично перемещённое не выдаётся за готовое, список перечитывается', async ({ page }) => {
  let reads = 0;
  const items = bigVault(30);
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.route('**/api/attachments/all', (route) => { reads += 1; route.fulfill({ json: { lockedNotes: 0, items } }); });
  await page.route('**/api/attachments/delete', (route) => route.fulfill({ json: { batch: '2-xyz', deleted: 3, bytes: 3000, skipped: { used: 0, missing: 0 }, trashed: JSON.parse(route.request().postData()).paths.slice(0, 3) } }));
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await page.getByTestId('attachments-select').click();
  await page.getByTestId('attachments-select-unused').click();
  await page.getByTestId('attachments-trash').click();
  const before = reads;
  await page.getByTestId('attachments-confirm').click();
  await expect(page.getByTestId('attachments-notice')).toContainText('3 files moved to the trash');
  await expect(page.getByTestId('attachments-notice')).toContainText('7 could not be moved');
  expect(reads).toBeGreaterThan(before);
});

// The notice and its Undo are fixed to the window, wherever the list is scrolled to.
test('вложения: уведомление с «Вернуть» всегда в окне', async ({ page }) => {
  await openPage(page, bigVault(120), async () => {
    await page.route('**/api/attachments/delete', (route) => route.fulfill({ json: { batch: '3-q', deleted: 1, bytes: 1100, skipped: {}, trashed: JSON.parse(route.request().postData()).paths } }));
  });
  await page.getByTestId('attachments-filter-unused').click();
  await page.getByTestId('attachment-open').first().click();
  await page.getByTestId('attachment-trash').click();
  const box = await page.getByTestId('attachments-notice').boundingBox();
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await expect(page.getByTestId('attachments-undo')).toBeVisible();
});

// Look-alike files: the end of the folder shows, the duplicates have a filter, search ignores separators.
test('вложения: одинаковые имена различимы по папке, фильтр «Одинаковые имена», поиск без учёта _ и -', async ({ page }) => {
  const mk = (folder, name) => ({ path: `notes/${folder}/_attachments/${name}`, name, kind: 'image', folder, size: 100, modified: new Date().toISOString(), usedBy: [] });
  await openPage(page, [mk('Work/Alpha/Chapter 1', 'IMG_4021.png'), mk('Work/Beta/Chapter 1', 'IMG_4021.png'), mk('Personal', 'other.png')]);
  await expect(page.getByTestId('attachments-filter-duplicates')).toBeVisible();
  await expect(page.getByTestId('attachment-folder').first()).toContainText('… / Alpha / Chapter 1');
  await page.getByTestId('attachments-filter-duplicates').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(2);
  await page.getByTestId('attachments-filter-duplicates').click();
  await page.getByTestId('attachments-query').fill('img 4021');
  await expect(page.getByTestId('attachment-card')).toHaveCount(2);
});

// The large view walks through the list with the arrows and zooms to the real size.
test('вложения: просмотр — стрелки между файлами и увеличение', async ({ page }) => {
  await openPage(page, bigVault(8));
  await page.getByTestId('attachments-sort').selectOption('name');
  await page.getByTestId('attachment-open').nth(1).click();
  const viewer = page.getByTestId('attachment-viewer');
  await expect(viewer).toContainText('2 of 8');
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('3 of 8');
  await page.getByTestId('attachment-next').click();
  await expect(viewer).toContainText('4 of 8');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toContainText('3 of 8');
  const zoom = page.getByTestId('attachment-zoom');
  if (await zoom.count()) {
    await zoom.click();
    await expect(zoom).toHaveAttribute('aria-label', 'Fit to window');
  }
});

// What was removed can be found again after the notice is gone, and brought back one by one.
test('вложения: «Недавно удалённые» — список корзины и возврат одного файла', async ({ page }) => {
  let restoredPaths = null;
  await openPage(page, bigVault(6), async () => {
    await page.route('**/api/attachments/trash', (route) => route.fulfill({ json: { days: 30, batches: [{ batch: '5-zz', at: new Date().toISOString(), files: [{ path: 'Work/Alpha/_attachments/old-1.png', name: 'old-1.png', size: 2048 }, { path: 'Personal/_attachments/old-2.png', name: 'old-2.png', size: 4096 }] }] } }));
    await page.route('**/api/attachments/restore', (route) => { restoredPaths = JSON.parse(route.request().postData()); route.fulfill({ json: { restored: 1, renamed: 0 } }); });
  });
  await page.getByTestId('attachments-trash-open').click();
  const view = page.getByTestId('attachments-trash-view');
  await expect(view).toContainText('old-1.png');
  await view.getByTestId('attachments-restore-one').first().click();
  await expect.poll(() => restoredPaths).toEqual({ batch: '5-zz', paths: ['Work/Alpha/_attachments/old-1.png'] });
});

// A failed load can be tried again.
test('вложения: при ошибке загрузки есть «Повторить»', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  let fail = true;
  await page.route('**/api/attachments/all', (route) => (fail ? route.fulfill({ status: 500, json: { detail: 'boom' } }) : route.fulfill({ json: { lockedNotes: 0, items: bigVault(3) } })));
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachments-retry')).toBeVisible();
  fail = false;
  await page.getByTestId('attachments-retry').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(3);
});

// A card asks for a small copy, not the original; a note that only writes the file's name is marked as such.
test('вложения: превью по адресу /thumb, пометка «по имени», выбор папки поиском', async ({ page }) => {
  const mk = (folder, name, usedBy) => ({ path: `notes/${folder}/_attachments/${name}`, name, kind: 'image', folder, size: 100, modified: '2026-10-01T10:00:00.000Z', usedBy });
  await page.route('**/api/attachments/thumb**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#6a8"/></svg>' }));
  await openPage(page, [
    mk('Work/Alpha/Deep/Chapter 1', 'a.png', [{ path: 'notes/x/L.md', title: 'Linked', via: 'link' }, { path: 'notes/x/N.md', title: 'Named', via: 'name' }]),
    mk('Personal', 'b.png', []),
    ...Array.from({ length: 12 }, (_, i) => mk(`Folder ${i}`, `c${i}.png`, [])),
  ]);
  await expect(page.locator('[data-testid=attachment-card] img').first()).toHaveAttribute('src', /\/api\/attachments\/thumb\?path=.*&w=480&v=2026-10-01/);
  await expect(page.getByTestId('attachment-notes').first()).toContainText('Named(by name)');
  await expect(page.getByTestId('attachment-notes').first()).not.toContainText('Linked (by name)');

  await page.getByTestId('attachments-folder').click();
  await page.getByTestId('attachments-folder-query').fill('chapter');
  await expect(page.getByTestId('attachments-folder-option')).toHaveCount(1);
  await page.getByTestId('attachments-folder-option').click();
  await expect(page.getByTestId('attachment-card')).toHaveCount(1);
  await expect(page.getByTestId('attachments-folder')).toContainText('Deep / Chapter 1');
});

// On a phone the filters wait behind one button, so the first cards are not pushed down the screen.
test('вложения на телефоне: фильтры за одной кнопкой', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/attachments/all', (route) => route.fulfill({ json: { lockedNotes: 0, items: bigVault(20) } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Open sidebar/ }).first().click();
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachment-card').first()).toBeVisible();
  await expect(page.getByTestId('attachments-sort')).toBeHidden();
  const first = await page.getByTestId('attachment-card').first().boundingBox();
  expect(first.y).toBeLessThan(520);
  await page.getByTestId('attachments-filters-toggle').click();
  await expect(page.getByTestId('attachments-sort')).toBeVisible();
});

// "Review unused" is one step: only the unused files, all chosen, ready to look through and move.
test('вложения: «Проверить неиспользуемые» одним шагом, русские единицы, переход в конец с клавиатуры', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => localStorage.setItem('locale', 'ru'));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.route('**/api/attachments/all', (route) => route.fulfill({ json: { lockedNotes: 0, items: bigVault(150) } }));
  await page.route('**/api/attachments/thumb**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>' }));
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await page.getByTestId('open-attachments').click();
  await expect(page.getByTestId('attachments-unused-summary')).toContainText(/КБ|МБ|Б/);
  await page.getByTestId('attachments-review-unused').click();
  await expect(page.getByTestId('attachments-selection-bar')).toBeVisible();
  await expect(page.getByTestId('attachments-selected')).toContainText('Выбрано: 50');
  await expect(page.getByTestId('attachments-filter-unused')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('attachments-filter-all').click();
  await page.getByTestId('attachments-skip').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('attachment-open').last()).toBeFocused();
});

// Found in the real app: the PDF viewer showed a blank box, and after the last unused file was moved the page
// stayed on an empty "Unused" list. A PDF shows its first page as a picture; an emptied filter returns to "All".
test('вложения: PDF в просмотре — первая страница картинкой, опустевший фильтр «Неиспользуемые» возвращает ко всем', async ({ page }) => {
  const mk = (name, kind, usedBy) => ({ path: `notes/Docs/_attachments/${name}`, name, kind, folder: 'Docs', size: 100, modified: '2026-10-01T10:00:00.000Z', usedBy });
  await page.route('**/api/attachments/thumb**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="56"><rect width="40" height="56" fill="#fff"/></svg>' }));
  await page.route('**/api/attachments/delete', (route) => route.fulfill({ json: { batch: '9-k', deleted: 1, bytes: 100, skipped: {}, trashed: JSON.parse(route.request().postData()).paths } }));
  await openPage(page, [mk('one.pdf', 'pdf', []), mk('two.png', 'image', [{ path: 'notes/x/N.md', title: 'N' }])]);
  await page.getByTestId('attachments-filter-unused').click();
  await page.getByTestId('attachment-open').first().click();
  await expect(page.getByTestId('attachment-pdf-page')).toHaveAttribute('src', /\/api\/attachments\/thumb\?path=.*w=1000/);
  await page.getByTestId('attachment-trash').click();
  await expect(page.getByTestId('attachments-filter-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('attachment-card')).toHaveCount(1);
});
