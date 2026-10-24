import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The template dialog is two columns inside one window. Each column scrolls by itself and the buttons stay where
// they can be pressed. It used to grow taller than the window: the whole dialog scrolled and the buttons left the
// screen, because the kit's Modal wraps its content in a block that did not take the height of the window.
async function openTemplates(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New' }).first().click();
  await page.getByRole('button', { name: 'Note from template' }).click();
  await expect(page.getByTestId('template-list-scroll')).toBeVisible();
  await page.getByTestId('template-list-scroll').getByText('Weekly Review', { exact: true }).click();
}

for (const [width, height] of [[1280, 720], [1024, 640], [1440, 900]]) {
  test(`окно шаблонов ${width}x${height}: колонки листаются сами, кнопки на экране, окно целиком не листается`, async ({ page }) => {
    await prepareMonos(page);
    await page.setViewportSize({ width, height });
    await openTemplates(page);
    // The New note dialog stays open underneath: the template dialog is the one that holds the list.
    const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('template-list-scroll') });

    const panel = await dialog.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, bottom: Math.round(el.getBoundingClientRect().bottom), vh: innerHeight }));
    expect(panel.scroll, JSON.stringify(panel)).toBeLessThanOrEqual(panel.client + 1);
    expect(panel.bottom).toBeLessThanOrEqual(panel.vh);

    const use = dialog.getByRole('button', { name: 'Create from template', exact: true });
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    for (const button of [use, cancel]) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box.y + box.height, 'a button is inside the window').toBeLessThanOrEqual(height);
    }

    const list = page.getByTestId('template-list-scroll');
    const preview = page.getByTestId('template-preview-scroll');
    const listMetrics = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(listMetrics.scroll, 'the list has more templates than fit, so it scrolls in itself').toBeGreaterThan(listMetrics.client);
    const before = await use.boundingBox();
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await preview.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const after = await use.boundingBox();
    expect(Math.abs(after.y - before.y), 'scrolling a column does not move the buttons').toBeLessThanOrEqual(1);
  });
}
