import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The label of the filled "Start writing" button once had the colour of its own background (contrast 1.00),
// because the kit variant's text colour outweighed the class that set it.
function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const rgb = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

for (const [theme, mode] of [['gruvbox', 'dark'], ['github', 'light'], ['nord', 'light'], ['catppuccin', 'dark']]) {
  test(`«Начать писать» читается и в рост 44px: ${theme}, ${mode}`, async ({ page }) => {
    await prepareMonos(page);
    // The server's choice wins over the browser's on load, so the palette is set there.
    const before = await (await page.request.get('/api/settings')).json();
    await page.request.post('/api/settings', { data: { theme, themeMode: mode } });
    await page.addInitScript(({ theme, mode }) => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('themeMode', mode);
    }, { theme, mode });
    await page.route('**/api/notes/recent**', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    const button = page.getByTestId('welcome-write-action');
    await expect(button).toBeVisible();
    await expect(page.locator('html')).toHaveClass(mode === 'dark' ? /dark/ : /^(?!.*dark).*$/);
    const style = await button.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor, height: el.getBoundingClientRect().height };
    });
    await page.request.post('/api/settings', { data: { theme: before.theme || 'gruvbox', themeMode: before.themeMode || 'system' } });
    expect(contrast(rgb(style.color), rgb(style.background))).toBeGreaterThanOrEqual(4.5);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });
}
