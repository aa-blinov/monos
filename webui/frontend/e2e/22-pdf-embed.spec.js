import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

// The smallest file the browser's PDF viewer accepts as a document: a header and an end-of-file marker.
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

test('PDF из вложений показывается рамкой внутри заметки и сохраняется как ![[имя.pdf]]', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Pdf Note');
  const created = await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Договор: ![[Contract.pdf]]' },
  });
  const notePath = (await created.json()).path;
  const attached = await page.request.post(`/api/attachments?notePath=${encodeURIComponent(notePath)}`, {
    multipart: { file: { name: 'Contract.pdf', mimeType: 'application/pdf', buffer: pdfBytes } },
  });
  expect(attached.status()).toBe(200);
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;

  await openNote(page, title);
  const frame = page.locator('.pdf-embed iframe.pdf-embed-frame');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /\/api\/attachments\/raw\?path=.*Contract\.pdf/);
  await expect(page.locator('.pdf-embed-head a')).toHaveAttribute('href', await frame.getAttribute('src'));

  // Typing in the paragraph above the frame saves the note; the embed is written back as the same `![[…]]` line.
  // The frame is a block of its own, so the click goes to the paragraph, not to the middle of the editor.
  await page.locator('.ProseMirror p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' дополнено');
  await expect.poll(savedContent).toContain('дополнено');
  expect(await savedContent()).toContain('![[Contract.pdf]]');
});

// Drops a PDF onto the editor the way a file dragged from the desktop arrives.
async function dropPdf(page, name) {
  await page.evaluate((fileName) => {
    const target = document.querySelector('.ProseMirror');
    const file = new File([new TextEncoder().encode('%PDF-1.4\n%%EOF\n')], fileName, { type: 'application/pdf' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, name);
}

test('PDF, перетянутый в редактор, прикрепляется к заметке и встаёт в место падения', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Pdf Drop');
  const created = await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Перед вложением' },
  });
  const notePath = (await created.json()).path;
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;

  await openNote(page, title);
  await page.locator('.ProseMirror p').first().click();
  await page.keyboard.press('End');
  await dropPdf(page, 'Dropped.pdf');

  await expect(page.locator('.pdf-embed-head span')).toHaveText('Dropped.pdf');
  await expect.poll(savedContent).toContain('![[Dropped.pdf]]');
  // The file is in the note's attachments, and the frame loads it as a PDF.
  const src = await page.locator('.pdf-embed iframe').getAttribute('src');
  const raw = await page.request.get(src);
  expect(raw.status()).toBe(200);
  expect(raw.headers()['content-type']).toBe('application/pdf');
});
