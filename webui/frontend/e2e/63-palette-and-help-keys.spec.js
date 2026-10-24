import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

// The palette is a dialog like the others: Tab stays inside it, Esc works wherever focus is, and focus goes back.
test('палитра команд держит фокус внутри, закрывается по Esc и возвращает фокус', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByTestId('open-more');
  await opener.focus();
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: /command palette|commands/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  // A click on the dialog's own text leaves focus on the page; Esc must still close it.
  await dialog.getByText(/Type a command|command/i).first().click({ force: true }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('⌘/ и Ctrl+/ открывают справку и в браузере', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+/');
  await expect(page).toHaveURL(/\/help/);
});
