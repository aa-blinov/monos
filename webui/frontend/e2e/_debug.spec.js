import { test, expect } from '@playwright/test';
import { createBlankNote, editorBody, fillEditor, prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('debug', async ({ page }) => {
  const title = uniqueTitle('Debug');
  await createBlankNote(page, title);
  await fillEditor(page, '# First Heading\n\nSome text');
  await page.waitForTimeout(2000);
  const text = await page.locator('.ProseMirror').first().innerText();
  console.log('PROSEMIRROR TEXT:', text);
  // Read saved file content
  const response = await page.request.get(`/api/file?path=notes/${encodeURIComponent(title)}.md`);
  const data = await response.json();
  console.log('FILE CONTENT:', data.content);
  // Check outline panel content
  const outlineText = await page.getByTestId('outline-panel').innerText();
  console.log('OUTLINE TEXT:', outlineText);
});
