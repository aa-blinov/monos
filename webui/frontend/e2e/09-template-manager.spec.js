import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => {
    localStorage.removeItem('customNoteTemplates');
    localStorage.removeItem('hiddenLibraryTemplateIds');
  });
});

test('template manager creates custom templates and hides library templates', async ({ page }) => {
  const templateTitle = uniqueTitle('Custom Template');

  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New template' }).click();
  await page.getByLabel('Template title').fill(templateTitle);
  await page.getByLabel('Description').fill('E2E managed template');
  await page.getByLabel('Folder').fill('Managed Templates');
  await page.getByLabel('Tags').fill('managed, e2e');
  await page.getByLabel('Markdown content').fill(`# {{title}}\n\nManaged body {{date}}`);
  await page.getByRole('button', { name: 'Create template' }).click();

  await expect(page.getByRole('heading', { name: templateTitle })).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get('/api/templates');
    const settings = await response.json();
    return settings.customTemplates[0]?.title || '';
  }).toBe(templateTitle);

  await page.getByRole('button', { name: 'Hide template' }).first().click();
  await expect.poll(async () => {
    const response = await page.request.get('/api/templates');
    const settings = await response.json();
    return settings.hiddenLibraryTemplateIds.length;
  }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Show template' }).first()).toBeVisible();

  await page.goto('/');
  await page.getByText('+ New note').click();
  await page.getByRole('button', { name: 'Note from template' }).click();
  await expect(page.getByRole('button', { name: new RegExp(templateTitle) })).toBeVisible();
});
