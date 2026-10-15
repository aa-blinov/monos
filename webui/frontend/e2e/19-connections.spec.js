import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

test('упоминание без ссылки связывается из панели «Связанные», а граф показывает связь', async ({ page }) => {
  await prepareMonos(page);
  const target = uniqueTitle('Mention Target');
  const source = uniqueTitle('Mention Source');

  await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'Цель.' } });
  const created = await page.request.post('/api/notes/create', {
    data: { title: source, category: '', tags: [], content: `Сегодня ${target} помогла.` },
  });
  const sourcePath = (await created.json()).path;
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(sourcePath)}`)).json()).content;

  await openNote(page, target);
  await page.getByTestId('property-related-button').click();
  const panel = page.getByTestId('property-panel');
  await expect(panel).toHaveAttribute('data-panel', 'related');
  await expect(panel.getByText(source)).toBeVisible();

  await panel.getByTestId('link-mention-button').click();
  await expect.poll(savedContent).toContain(`[[${target}]]`);

  // The mention is a backlink now: it leaves the mention list and joins the local graph.
  await expect(panel.getByTestId('link-mention-button')).toHaveCount(0);
  await expect(panel.getByTestId('local-graph')).toBeVisible();
});

test('битые ссылки видны в «Настройках» и открывают заметку, где они стоят', async ({ page }) => {
  await prepareMonos(page);
  const broken = uniqueTitle('Broken Source');
  const missing = uniqueTitle('Missing Note');
  await page.request.post('/api/notes/create', {
    data: { title: broken, category: '', tags: [], content: `См. [[${missing}]].` },
  });

  await page.goto('/settings');
  const brokenList = page.getByTestId('broken-links');
  await expect(brokenList).toContainText(`[[${missing}]]`);
  await brokenList.getByRole('button', { name: `in ${broken}` }).click();
  await expect(page.locator('.ProseMirror').first()).toContainText(missing);
});
