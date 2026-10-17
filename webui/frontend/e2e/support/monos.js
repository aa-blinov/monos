import { expect } from '@playwright/test';

export const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

export async function prepareMonos(page, {
  clipboardText = '',
  clipboardImageBase64 = tinyPngBase64,
} = {}) {
  await page.addInitScript(({ clipboardText, clipboardImageBase64 }) => {
    localStorage.setItem('locale', 'en');
    localStorage.setItem('darkMode', 'true');

    const imageBytes = Uint8Array.from(atob(clipboardImageBase64), (char) => char.charCodeAt(0));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async read() {
          const blob = new Blob([imageBytes], { type: 'image/png' });
          return [{ types: ['image/png'], getType: async () => blob }];
        },
        async readText() {
          return clipboardText;
        },
      },
    });
  }, { clipboardText, clipboardImageBase64 });

  await page.request.post('/api/settings', {
    data: {
      locale: 'en',
      theme: 'gruvbox',
      fontFamily: 'JetBrains Mono',
      fontSize: 'medium',
      editorFontSize: 'md',
    },
  });
}

// The advanced group in Settings starts closed; a test that needs its sections opens it first.
export async function openAdvancedSettings(page) {
  await page.getByTestId('advanced-settings').evaluate((el) => { el.open = true; });
}

export function uniqueTitle(prefix) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function createBlankNote(page, title) {
  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^(\+\s*)?New note$/i }).click();
  await page.getByLabel('Name', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
}

export async function openNote(page, name) {
  await page.goto('/');
  // The card whose name starts with the title: another note's excerpt may quote the title too
  // ("See [[Rename Me]]"), and that card can come first on the board.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const any = page.getByRole('button', { name: new RegExp(escaped, 'i') });
  await any.first().waitFor();
  const exact = page.getByRole('button', { name: new RegExp(`^\\s*${escaped}`, 'i') });
  const target = (await exact.count()) > 0 ? exact : any;
  await target.first().click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(new RegExp(name, 'i'));
}

export async function openBoardCard(page, title, filePath = '') {
  if (filePath) {
    // The board sorts by modification time, and earlier specs leave many notes
    // behind, so an older seeded note can sit out of the rendered cards. Re-saving
    // the same text makes it the most recent note again.
    const query = `path=${encodeURIComponent(filePath)}`;
    const { content } = await (await page.request.get(`/api/file?${query}`)).json();
    await page.request.post(`/api/file?${query}`, { data: { content } });
    await page.request.post(`/api/notes/touch?${query}`);
  }
  await page.goto('/');
  const card = page.locator('main').getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}\\b`) }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(new RegExp(escapeRegExp(title)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function editorBody(page) {
  return page.locator('.ProseMirror').first();
}

export async function fillEditor(page, content) {
  const editor = editorBody(page);
  await expect(editor).toBeVisible();
  await editor.fill(content);
}

export async function waitForSavedContent(page, notePath, matcher) {
  await expect.poll(async () => {
    const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
    if (!response.ok()) return '';
    return (await response.json()).content || '';
  }).toContain(matcher);
}

export async function dropTinyImage(page, selector = '.ProseMirror') {
  await page.evaluate(({ selector, tinyPngBase64 }) => {
    const target = document.querySelector(selector);
    if (!target) throw new Error(`Missing drop target: ${selector}`);
    const bytes = Uint8Array.from(atob(tinyPngBase64), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'drop.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, { selector, tinyPngBase64 });
}

// Templates, saved searches, tags and the notes table sit in the sidebar's "More" menu on a wide window.
export async function openSidebarMore(page) {
  const more = page.getByTestId('open-more');
  if (await more.isVisible()) await more.click();
}
