# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webui/frontend/e2e/55-notes-table.spec.js >> таблица заметок: правка ячейки на месте, Esc отменяет, сбой записи виден
- Location: webui/frontend/e2e/55-notes-table.spec.js:87:1

# Error details

```
TypeError: apiRequestContext.post: Invalid URL
```

# Test source

```ts
  1   | import { expect } from '@playwright/test';
  2   | 
  3   | export const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  4   | 
  5   | export async function prepareMonos(page, {
  6   |   clipboardText = '',
  7   |   clipboardImageBase64 = tinyPngBase64,
  8   | } = {}) {
  9   |   await page.addInitScript(({ clipboardText, clipboardImageBase64 }) => {
  10  |     localStorage.setItem('locale', 'en');
  11  |     localStorage.setItem('darkMode', 'true');
  12  | 
  13  |     const imageBytes = Uint8Array.from(atob(clipboardImageBase64), (char) => char.charCodeAt(0));
  14  |     Object.defineProperty(navigator, 'clipboard', {
  15  |       configurable: true,
  16  |       value: {
  17  |         async read() {
  18  |           const blob = new Blob([imageBytes], { type: 'image/png' });
  19  |           return [{ types: ['image/png'], getType: async () => blob }];
  20  |         },
  21  |         async readText() {
  22  |           return clipboardText;
  23  |         },
  24  |       },
  25  |     });
  26  |   }, { clipboardText, clipboardImageBase64 });
  27  | 
> 28  |   await page.request.post('/api/settings', {
      |                      ^ TypeError: apiRequestContext.post: Invalid URL
  29  |     data: {
  30  |       locale: 'en',
  31  |       theme: 'gruvbox',
  32  |       fontFamily: 'JetBrains Mono',
  33  |       fontSize: 'medium',
  34  |       editorFontSize: 'md',
  35  |     },
  36  |   });
  37  | }
  38  | 
  39  | // The advanced group in Settings starts closed; a test that needs its sections opens it first.
  40  | export async function openAdvancedSettings(page) {
  41  |   await page.getByTestId('advanced-settings').evaluate((el) => { el.open = true; });
  42  | }
  43  | 
  44  | export function uniqueTitle(prefix) {
  45  |   return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  46  | }
  47  | 
  48  | export async function createBlankNote(page, title) {
  49  |   await page.goto('/');
  50  |   await page.locator('main').getByRole('button', { name: /^(\+\s*)?New note$/i }).click();
  51  |   await page.getByLabel('Name', { exact: true }).fill(title);
  52  |   await page.getByRole('button', { name: /^Create$/ }).click();
  53  |   await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
  54  | }
  55  | 
  56  | export async function openNote(page, name) {
  57  |   await page.goto('/');
  58  |   // The card whose name starts with the title: another note's excerpt may quote the title too
  59  |   // ("See [[Rename Me]]"), and that card can come first on the board.
  60  |   const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  61  |   const any = page.getByRole('button', { name: new RegExp(escaped, 'i') });
  62  |   await any.first().waitFor();
  63  |   const exact = page.getByRole('button', { name: new RegExp(`^\\s*${escaped}`, 'i') });
  64  |   const target = (await exact.count()) > 0 ? exact : any;
  65  |   await target.first().click();
  66  |   await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(new RegExp(name, 'i'));
  67  | }
  68  | 
  69  | export async function openBoardCard(page, title, filePath = '') {
  70  |   if (filePath) {
  71  |     // The board sorts by modification time, and earlier specs leave many notes
  72  |     // behind, so an older seeded note can sit out of the rendered cards. Re-saving
  73  |     // the same text makes it the most recent note again.
  74  |     const query = `path=${encodeURIComponent(filePath)}`;
  75  |     const { content } = await (await page.request.get(`/api/file?${query}`)).json();
  76  |     await page.request.post(`/api/file?${query}`, { data: { content } });
  77  |     await page.request.post(`/api/notes/touch?${query}`);
  78  |   }
  79  |   await page.goto('/');
  80  |   const card = page.locator('main').getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}\\b`) }).first();
  81  |   await expect(card).toBeVisible();
  82  |   await card.click();
  83  |   await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(new RegExp(escapeRegExp(title)));
  84  | }
  85  | 
  86  | function escapeRegExp(value) {
  87  |   return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  88  | }
  89  | 
  90  | export function editorBody(page) {
  91  |   return page.locator('.ProseMirror').first();
  92  | }
  93  | 
  94  | export async function fillEditor(page, content) {
  95  |   const editor = editorBody(page);
  96  |   await expect(editor).toBeVisible();
  97  |   await editor.fill(content);
  98  | }
  99  | 
  100 | export async function waitForSavedContent(page, notePath, matcher) {
  101 |   await expect.poll(async () => {
  102 |     const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
  103 |     if (!response.ok()) return '';
  104 |     return (await response.json()).content || '';
  105 |   }).toContain(matcher);
  106 | }
  107 | 
  108 | export async function dropTinyImage(page, selector = '.ProseMirror') {
  109 |   await page.evaluate(({ selector, tinyPngBase64 }) => {
  110 |     const target = document.querySelector(selector);
  111 |     if (!target) throw new Error(`Missing drop target: ${selector}`);
  112 |     const bytes = Uint8Array.from(atob(tinyPngBase64), (char) => char.charCodeAt(0));
  113 |     const file = new File([bytes], 'drop.png', { type: 'image/png' });
  114 |     const dataTransfer = new DataTransfer();
  115 |     dataTransfer.items.add(file);
  116 |     target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
  117 |     target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  118 |   }, { selector, tinyPngBase64 });
  119 | }
  120 | 
  121 | // Templates, saved searches, tags, the notes table and the trash sit in the sidebar's "Other" menu.
  122 | export async function openSidebarMore(page) {
  123 |   const more = page.getByTestId('open-more');
  124 |   if (await more.isVisible()) await more.click();
  125 | }
  126 | 
```