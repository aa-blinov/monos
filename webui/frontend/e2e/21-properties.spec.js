import { expect, test } from '@playwright/test';
import { createBlankNote, prepareMonos, uniqueTitle } from './support/monos.js';

test('таблица заметок открывается из палитры всегда, а из боковой панели — когда у заметок есть свойства', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('dialog').getByRole('combobox').fill('notes table');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('properties-view')).toBeVisible();

  // The old word still finds it: "properties" is in the command's description.
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('dialog').getByRole('combobox').fill('properties');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('properties-view')).toBeVisible();

  const title = uniqueTitle('Has Property');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: '---\nstatus: draft\n---\nТекст' } });
  await page.goto('/');
  await page.getByTestId('open-properties').click();
  await expect(page.getByTestId('properties-view')).toBeVisible();
});

test('свойства заметки пишутся в шапку, видны в таблице и находятся фильтром prop:', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Properties Note');
  const notePath = `notes/${title}.md`;
  const savedContent = async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;
  await createBlankNote(page, title);

  await page.getByTestId('property-properties-button').click();
  const panel = page.locator('[data-panel="properties"]');
  await expect(panel).toBeVisible();

  // A number property: typed into the form, written to the frontmatter and listed at once.
  await panel.getByLabel('Name', { exact: true }).fill('priority');
  await panel.locator('form select').selectOption('number');
  await panel.getByLabel('Value', { exact: true }).fill('4');
  await panel.getByRole('button', { name: 'Add property' }).click();
  await expect(panel.getByTestId('note-property')).toHaveCount(1);
  await expect(panel.getByLabel('priority', { exact: true })).toHaveValue('4');
  await expect.poll(savedContent).toContain('priority: 4');

  // A checkbox property.
  await panel.getByLabel('Name', { exact: true }).fill('done');
  await panel.locator('form select').selectOption('checkbox');
  await panel.locator('form').getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Add property' }).click();
  await expect(panel.getByTestId('note-property')).toHaveCount(2);
  await expect(panel.getByTestId('note-property').filter({ hasText: 'done' }).getByRole('checkbox')).toBeChecked();
  await expect.poll(savedContent).toContain('done: true');

  // Removing one property takes its line out and leaves the other one.
  await panel.getByRole('button', { name: 'Remove priority' }).click();
  await expect(panel.getByTestId('note-property')).toHaveCount(1);
  await expect.poll(savedContent).not.toContain('priority:');
  await expect.poll(savedContent).toContain('done: true');

  // The table lists the note; prop: filters it in and out.
  await page.goto('/properties');
  const table = page.getByTestId('properties-view');
  const query = page.getByTestId('properties-query');
  await query.fill('prop:done=true');
  await expect(table.getByRole('button', { name: title, exact: true })).toBeVisible();
  await query.fill('prop:done=false');
  await expect(table.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});
