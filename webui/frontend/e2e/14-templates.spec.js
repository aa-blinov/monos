import { expect, test } from '@playwright/test';
import { createBlankNote, openBoardCard, openSidebarMore, prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '+ New' }).first()).toBeVisible({ timeout: 20000 });
});

async function fileContent(page, notePath) {
  const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
  return response.ok() ? (await response.json()).content : '';
}

async function openTemplateModal(page) {
  await page.getByRole('button', { name: '+ New' }).first().click();
  await page.getByRole('button', { name: 'Note from template' }).click();
  await expect(page.getByTestId('template-list-scroll')).toBeVisible();
}

async function pickWeeklyReview(page) {
  await page.getByTestId('template-list-scroll').getByText('Weekly Review', { exact: true }).click();
}

test('шаблон предлагает название с датой в ISO и не показывает бейдж категории', async ({ page }) => {
  await openTemplateModal(page);
  await pickWeeklyReview(page);
  await expect(page.locator('#template-title')).toHaveValue(/^Weekly Review \d{4}-\d{2}-\d{2}$/);
  // Категория уже есть в поле «Папка», на карточке она больше не дублируется.
  await expect(page.getByTestId('template-list-scroll').getByText('Reviews', { exact: true })).toHaveCount(0);
});

test('модалка шаблонов называется «Templates»', async ({ page }) => {
  await openTemplateModal(page);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Templates' })).toBeVisible();
});

test('повторное создание шаблона: ошибка видна в модалке и предлагает копию с номером', async ({ page }) => {
  const name = uniqueTitle('Review Dup');
  await openTemplateModal(page);
  await pickWeeklyReview(page);
  await page.locator('#template-title').fill(name);
  await page.getByRole('button', { name: 'Create from template' }).click();
  await expect(page.getByTestId('rich-editor-input')).toBeVisible({ timeout: 20000 });

  await openTemplateModal(page);
  await pickWeeklyReview(page);
  await page.locator('#template-title').fill(name);
  await page.getByRole('button', { name: 'Create from template' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('already exists');
  await expect(alert.getByRole('button', { name: 'Open the existing note' })).toBeVisible();
  await alert.getByRole('button', { name: `Create as ${name} 2` }).click();

  await expect(page.locator('#template-title')).toHaveCount(0);
  await expect(page).toHaveURL(/2\.md/, { timeout: 20000 });
});

test('менеджер шаблонов: «Create from template» открывает модалку на этом шаблоне', async ({ page }) => {
  await openSidebarMore(page);
  await page.getByRole('menuitem', { name: 'Templates', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();

  const card = page.getByRole('article').filter({ hasText: 'Weekly Review' }).first();
  await card.getByRole('button', { name: 'Create note' }).click();

  await expect(page.locator('#template-title')).toHaveValue(/^Weekly Review \d{4}-\d{2}-\d{2}$/);
});

test('пустая задача в заметке остаётся чекбоксом, а отметка сохраняется в файле', async ({ page }) => {
  const title = uniqueTitle('Task Checkbox Note');
  const notePath = `notes/${title}.md`;
  await page.request.post(`/api/file?path=${encodeURIComponent(notePath)}&create=1`, {
    data: { content: `---\ntitle: "${title}"\n---\n\n# Tasks\n\n- [ ]\n- [x] Done\n` },
  });
  await openBoardCard(page, title, notePath);

  const boxes = page.locator('.ProseMirror input[type="checkbox"]');
  await expect(boxes).toHaveCount(2);
  await expect(page.locator('.ProseMirror')).not.toContainText('[ ]');

  await boxes.first().click();
  await expect.poll(() => fileContent(page, notePath), { timeout: 8000 }).toContain('- [x]');
  await expect.poll(() => fileContent(page, notePath), { timeout: 8000 }).toContain('- [x] Done');
});

test('создание пустой заметки по-прежнему открывает редактор', async ({ page }) => {
  await createBlankNote(page, uniqueTitle('Plain Note'));
  await expect(page.getByTestId('rich-editor-input')).toBeVisible();
});

test('русская локаль: название шаблона с датой через точку', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'ru'));
  await page.reload();
  await page.locator('button').filter({ hasText: /^\+/ }).first().click();
  await page.getByRole('button', { name: 'Заметка из шаблона' }).click();
  await page.getByTestId('template-list-scroll').getByText('Еженедельный обзор', { exact: true }).click();
  await expect(page.locator('#template-title')).toHaveValue(/^Еженедельный обзор \d{2}\.\d{2}\.\d{4}$/);
});
