import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

const body = '## **Введение**\n\ntext\n\n---\n\n## Второй раздел\n\ntext\n\n## _Третий_ раздел\n\ntext\n';

async function openNote(page, title) {
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: body } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await expect(page.getByTestId('outline-panel')).toBeVisible();
}

// The outline shows headings as the reader sees them, and a rule in the text does not cut it short.
test('структура: заголовки без разметки, линия --- не обрывает список', async ({ page }) => {
  await prepareMonos(page);
  await openNote(page, `Outline markup ${Date.now()}`);
  const items = page.getByTestId('outline-item');
  await expect(items).toHaveText(['Введение', 'Второй раздел', 'Третий раздел']);
  await items.first().click();
});

// The column is drawn wider or narrower by its left edge, keeps the width, and folds away from its own button.
test('структура: ширина тянется, запоминается, колонка прячется', async ({ page }) => {
  await prepareMonos(page);
  await openNote(page, `Outline resize ${Date.now()}`);
  const panel = page.getByTestId('outline-panel');
  const before = (await panel.boundingBox()).width;
  const handle = page.getByTestId('outline-resize');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + 200, { steps: 6 });
  await page.mouse.up();
  const wider = (await panel.boundingBox()).width;
  expect(wider).toBeGreaterThan(before + 60);
  await page.reload();
  await expect(panel).toBeVisible();
  expect(Math.abs((await panel.boundingBox()).width - wider)).toBeLessThan(2);
  await handle.dblclick();
  expect(Math.abs((await panel.boundingBox()).width - 224)).toBeLessThan(2);
  await panel.getByRole('button', { name: 'Close outline' }).click();
  await expect(panel).toBeHidden();
  await page.getByTestId('outline-toggle').click();
  await expect(panel).toBeVisible();
});
