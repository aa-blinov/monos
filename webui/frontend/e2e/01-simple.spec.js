import { test, expect } from '@playwright/test';
import { createBlankNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page, { editMode: 'source' });
});

test('opens seeded notes and navigates through the shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Monos', exact: true })).toBeVisible();
  const welcomeCard = page.locator('main .note-card').filter({ hasText: 'Welcome.md' }).first();
  await expect(welcomeCard).toBeVisible();

  await welcomeCard.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open note' }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
  await expect(page.getByText(/Welcome to Monos/i)).toBeVisible();

  await page.getByRole('button', { name: 'Monos' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Open a note from the sidebar/i)).toBeVisible();
});

test('creates a blank note and persists source edits', async ({ page }) => {
  const title = uniqueTitle('Release Smoke Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  const textarea = page.locator('textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill(`This note was created by Playwright.\n\nrelease-smoke-token-${title}`);

  await waitForSavedContent(page, notePath, 'release-smoke-token');
  await page.reload();
  await expect(page.locator('textarea')).toHaveValue(/release-smoke-token/);
});

test('changes settings and persists them through the backend', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.locator('#font-size').selectOption('large');
  await page.locator('#editor-font-size').selectOption('lg');
  await page.locator('#default-mode').selectOption('rich');
  await page.locator('#interface-language').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await page.locator('#interface-language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await expect.poll(async () => {
    const response = await page.request.get('/api/settings');
    return response.ok() ? await response.json() : {};
  }).toMatchObject({
    fontSize: 'large',
    editorFontSize: 'lg',
    editMode: 'rich',
    locale: 'en',
  });
});

test('board mode is a full-width quick preview workspace', async ({ page }) => {
  await page.goto('/');
  await page.locator('main .note-card').filter({ hasText: 'Welcome.md' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open note' }).click();
  await expect(page).toHaveURL(/\/notes\/Welcome/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');

  await page.getByRole('button', { name: 'Board view' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();

  await page.getByRole('button', { name: '4 columns' }).click();
  await page.locator('main .note-card').filter({ hasText: 'Welcome.md' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Welcome to Monos.');
  await dialog.getByRole('button', { name: 'Open note' }).click();

  await expect(page).toHaveURL(/\/notes\/Welcome/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
});

test('board preview keeps note path separated from content panel', async ({ page }) => {
  const notePath = 'notes/Preview Layout Regression.md';
  const title = 'Article 2. Measuring ROI Without Turning AI Adoption Into Theater';
  const content = `---
title: "${title}"
tags: ["preview", "layout"]
---

We already know that AI is not magic. It is probability, math, workflow, and risk management.

## Main rule

Before buying another subscription, inspect the process you are trying to improve.
`;

  await page.setViewportSize({ width: 768, height: 668 });
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'board');
    localStorage.setItem('boardColumns', '2');
  });
  await page.request.post(`/api/file?path=${encodeURIComponent(notePath)}`, {
    data: { content },
  });

  await page.goto('/');
  await page.getByRole('button').filter({ hasText: title }).click();

  const dialog = page.getByRole('dialog');
  const pathLabel = dialog.getByTestId('note-preview-path');
  const previewBody = dialog.getByTestId('note-preview-body');

  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  await expect(pathLabel).toHaveText(notePath);
  await expect(previewBody).toContainText('Main rule');

  const boxes = await Promise.all([
    pathLabel.boundingBox(),
    previewBody.boundingBox(),
  ]);
  const [pathBox, previewBox] = boxes;
  expect(pathBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(pathBox.y + pathBox.height).toBeLessThanOrEqual(previewBox.y - 4);
});

test('sidebar keeps only the tree area scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'list');
  });

  for (let index = 0; index < 36; index += 1) {
    const padded = String(index + 1).padStart(2, '0');
    await page.request.post(`/api/file?path=${encodeURIComponent(`notes/Scroll Test ${padded}.md`)}`, {
      data: {
        content: `---
title: "Scroll Test ${padded}"
tags: ["layout"]
---

Sidebar scroll regression note ${padded}.
`,
      },
    });
  }

  await page.goto('/');
  await expect(page.getByTestId('tree-drop-zone')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="sidebar-shell"]');
    const tree = document.querySelector('[data-testid="tree-drop-zone"]');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const treeStyle = tree ? getComputedStyle(tree) : null;

    return {
      shell: shell && shellStyle ? {
        clientHeight: shell.clientHeight,
        scrollHeight: shell.scrollHeight,
        overflowY: shellStyle.overflowY,
        right: shell.getBoundingClientRect().right,
      } : null,
      tree: tree && treeStyle ? {
        clientHeight: tree.clientHeight,
        scrollHeight: tree.scrollHeight,
        overflowY: treeStyle.overflowY,
        right: tree.getBoundingClientRect().right,
      } : null,
    };
  });

  expect(metrics.shell).not.toBeNull();
  expect(metrics.tree).not.toBeNull();
  expect(metrics.shell.overflowY).toBe('hidden');
  expect(metrics.shell.scrollHeight - metrics.shell.clientHeight, JSON.stringify(metrics.shell)).toBeLessThanOrEqual(2);
  expect(metrics.tree.overflowY).toBe('auto');
  expect(metrics.tree.scrollHeight - metrics.tree.clientHeight, JSON.stringify(metrics.tree)).toBeGreaterThan(40);
  expect(metrics.shell.right - metrics.tree.right, JSON.stringify(metrics)).toBeGreaterThanOrEqual(10);
});
