import { expect } from '@playwright/test';

export const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

export async function prepareMonos(page, {
  editMode = 'source',
  clipboardText = '',
  clipboardImageBase64 = tinyPngBase64,
} = {}) {
  await page.addInitScript(({ editMode, clipboardText, clipboardImageBase64 }) => {
    localStorage.setItem('locale', 'en');
    localStorage.setItem('editMode', editMode);
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
  }, { editMode, clipboardText, clipboardImageBase64 });

  await page.request.post('/api/settings', {
    data: {
      locale: 'en',
      theme: 'gruvbox',
      editMode,
      fontFamily: 'JetBrains Mono',
      fontSize: 'medium',
      editorFontSize: 'md',
    },
  });
}

export function uniqueTitle(prefix) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function createBlankNote(page, title) {
  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^\+\s*New note$/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
}

export async function openNote(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(new RegExp(name, 'i'));
}

export async function waitForSavedContent(page, notePath, matcher) {
  await expect.poll(async () => {
    const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
    if (!response.ok()) return '';
    return (await response.json()).content || '';
  }).toContain(matcher);
}

export async function dropTinyImage(page, selector = 'textarea') {
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
