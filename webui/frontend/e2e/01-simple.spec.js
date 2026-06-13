import { test, expect } from '@playwright/test';
import { createBlankNote, editorBody, fillEditor, openBoardCard, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('opens seeded notes and navigates through the shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
  await openBoardCard(page, 'Welcome', 'notes/Welcome.md');
  await expect(page.getByText(/Welcome to Monos/i)).toBeVisible();

  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
});

test('creates a blank note and persists rich editor edits', async ({ page }) => {
  const title = uniqueTitle('Release Smoke Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await fillEditor(page, `This note was created by Playwright.\n\nrelease-smoke-token-${title}`);

  await waitForSavedContent(page, notePath, 'release-smoke-token');
  await page.reload();
  await expect(editorBody(page)).toContainText('release-smoke-token');
});

test('changes settings and persists them through the backend', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.locator('#font-size').selectOption('large');
  await page.locator('#editor-font-size').selectOption('lg');
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
    locale: 'en',
  });
});

test('board mode is a full-width direct-open workspace', async ({ page }) => {
  await page.goto('/');
  await openBoardCard(page, 'Welcome', 'notes/Welcome.md');
  await expect(page).toHaveURL(/\/notes\/Welcome/);

  await page.getByRole('button', { name: 'Back to notes' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();

  await page.getByRole('button', { name: '4 columns' }).click();
  await page.locator('main').getByRole('button', { name: /^Welcome\b/ }).first().click();

  await expect(page).toHaveURL(/\/notes\/Welcome/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue('Welcome');
  await expect(editorBody(page)).toContainText('Welcome to Monos.');
});

test('board cards show folder path separately and open the note directly', async ({ page }) => {
  const title = 'Preview Layout Regression';
  const content = `
We already know that AI is not magic. It is probability, math, workflow, and risk management.

## Main rule

Before buying another subscription, inspect the process you are trying to improve.
`;

  await page.setViewportSize({ width: 768, height: 668 });
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'board');
    localStorage.setItem('boardColumns', '2');
  });
  const created = await page.request.post('/api/notes/create', {
    data: { title, category: 'Articles', tags: ['preview', 'layout'], content },
  });
  const createdNote = await created.json();
  await page.request.post(`/api/notes/touch?path=${encodeURIComponent(createdNote.path)}`);

  await page.goto('/');
  const card = page.locator('main').getByRole('button', { name: new RegExp(`^${title}\\b`) }).first();
  await expect(card).toContainText('Articles');
  await expect(card).not.toContainText('Articles/Preview Layout Regression.md');
  await card.click();

  await expect(page).toHaveURL(/\/notes\/Articles\/Preview%20Layout%20Regression/);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
  await expect(editorBody(page)).toContainText('Main rule');
});

test('sidebar keeps only the tree area scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 740 });
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
});
