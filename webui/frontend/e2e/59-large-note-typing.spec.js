import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// 9,000 paragraphs (about 0.9 MB). The whole note used to be written out for the file on every keystroke.
test('в большой заметке нажатие клавиши не ждёт сборки всего текста', async ({ page }) => {
  test.setTimeout(120_000);
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = `Big ${Date.now()}`;
  const body = Array.from({ length: 9000 }, (_, index) => `Paragraph ${index} with some words in it to make it longer`).join('\n\n');
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Big', tags: [], content: body } })).json();
  await page.goto(`/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`);
  const editor = page.getByTestId('rich-editor-input');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator('p').first().click();

  const timings = await page.evaluate(async () => {
    const input = document.querySelector('[data-testid="rich-editor-input"]');
    const marks = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      document.execCommand('insertText', false, 'x');
      // The task queue runs after the handlers of the key have finished.
      await new Promise((resolve) => setTimeout(resolve, 0));
      marks.push(performance.now() - started);
    }
    return { marks, active: document.activeElement === input };
  });
  const sorted = [...timings.marks].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log('keystroke ms median', Math.round(median), 'max', Math.round(sorted[sorted.length - 1]));
  expect(median).toBeLessThan(120);

  // The save wrote what was typed and left the other 8,999 paragraphs byte for byte.
  const query = `path=${encodeURIComponent(created.path)}`;
  await expect.poll(async () => String((await (await page.request.get(`/api/file?${query}`)).json()).content), { timeout: 20_000 })
    .toContain('xxxxxxxxxxxxxxxxxxxx');
  const saved = String((await (await page.request.get(`/api/file?${query}`)).json()).content);
  const savedBody = saved.replace(/^---\n[\s\S]*?\n---\n+/, '');
  expect(savedBody.split('\n\n').slice(1).join('\n\n').replace(/\n$/, '')).toBe(body.split('\n\n').slice(1).join('\n\n'));
});
