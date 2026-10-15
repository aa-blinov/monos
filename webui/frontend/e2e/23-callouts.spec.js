import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

test('выноска Obsidian показывается цветной цитатой, а метка остаётся в файле без экранирования', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Callout Note');
  const created = await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: '> [!warning] Осторожно\n> Здесь важно\n\nАбзац после' },
  });
  const notePath = (await created.json()).path;
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;

  await openNote(page, title);
  const callout = page.locator('.ProseMirror blockquote.callout');
  await expect(callout).toHaveAttribute('data-callout', 'warning');
  await expect(callout).toHaveClass(/callout-yellow/);

  // Typing in the paragraph after the callout saves the note; the marker must come back as Obsidian writes it.
  await page.getByText('Абзац после', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ок');
  await expect.poll(savedContent).toContain('Абзац после ок');
  const saved = await savedContent();
  expect(saved).toContain('> [!warning] Осторожно');
  expect(saved).not.toContain('\\[!warning');
});
