import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'list');
  });
  await prepareMonos(page);
});

test('dragging a note from the tree into the editor creates a wiki link', async ({ page }) => {
  const sourceTitle = uniqueTitle('Drag Source');
  const targetTitle = uniqueTitle('Drag Target');
  const category = 'Drag Links';

  const sourceResponse = await page.request.post('/api/notes/create', {
    data: { title: sourceTitle, category, tags: [], content: `# ${sourceTitle}\n\nSource note.` },
  });
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();

  const targetResponse = await page.request.post('/api/notes/create', {
    data: { title: targetTitle, category, tags: [], content: `# ${targetTitle}\n\n` },
  });
  expect(targetResponse.ok()).toBeTruthy();
  const target = await targetResponse.json();

  await page.goto(`/notes/${target.path.replace(/^notes\//, '')}`);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(targetTitle);
  await expect(page.getByTestId('tree-drop-zone').getByRole('button', { name: sourceTitle })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toBeVisible();

  await page.evaluate(({ sourceTitle }) => {
    const sourceButton = [...document.querySelectorAll('[data-testid="tree-drop-zone"] button')]
      .find((button) => button.textContent?.trim() === sourceTitle);
    const targetEditor = document.querySelector('.ProseMirror');
    if (!sourceButton || !targetEditor) throw new Error('Missing drag source or editor target');

    const rect = targetEditor.getBoundingClientRect();
    const clientX = rect.left + Math.min(80, Math.max(16, rect.width / 2));
    const clientY = rect.top + Math.min(80, Math.max(16, rect.height / 2));
    const dataTransfer = new DataTransfer();

    sourceButton.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: sourceButton.getBoundingClientRect().left + 8,
      clientY: sourceButton.getBoundingClientRect().top + 8,
    }));
    targetEditor.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX,
      clientY,
    }));
    targetEditor.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX,
      clientY,
    }));
  }, { sourceTitle });

  await expect(page.locator('.ProseMirror')).toContainText(`[[${sourceTitle}]]`);
  await waitForSavedContent(page, target.path, `[[${sourceTitle}]]`);
  const savedTarget = await page.request.get(`/api/file?path=${encodeURIComponent(target.path)}`);
  expect(await savedTarget.json()).toMatchObject({
    content: expect.not.stringContaining(source.path),
  });
});
