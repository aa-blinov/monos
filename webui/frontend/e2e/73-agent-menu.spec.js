import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The desktop shell's bridge, as far as the agent row needs it: a shell that records what is typed into it, and
// a computer that has Codex, Aider and nothing else.
async function fakeShell(page) {
  await page.addInitScript(() => {
    window.__typed = [];
    window.monosTerminal = {
      create: async () => ({ id: 1, cwd: 'notes', root: '/notes', folder: '', shell: 'zsh' }),
      write: (id, data) => window.__typed.push(data),
      resize() {}, kill() {},
      process: async () => ({ process: 'zsh', shell: 'zsh' }),
      detectAgents: async (commands) => commands.filter((command) => ['codex', 'aider'].includes(command)),
      onData: () => () => {}, onExit: () => () => {},
    };
  });
}

test('меню агента предлагает найденных на компьютере и запускает выбранного', async ({ page }) => {
  await prepareMonos(page);
  await fakeShell(page);
  await page.goto('/');
  await page.keyboard.press('Control+`');
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 30000 });

  await page.getByTestId('agent-menu').click();
  const menu = page.getByTestId('agent-menu-list');
  // The agents are radio items (the one in use is ticked); the two commands below them are plain items.
  await expect(menu.locator('[role^="menuitem"]')).toHaveText([/Codex/, /Aider/, /Другая команда|Another command/, /Искать снова|Search again/]);
  await expect(menu).not.toContainText('Gemini');

  await page.getByTestId('agent-choice-codex').click();
  await expect.poll(() => page.evaluate(() => window.__typed)).toContain('codex\r');
  await expect(page.getByTestId('agent-launch')).toContainText(/Codex/i);
  await expect.poll(async () => (await (await page.request.get('/api/settings')).json()).agent_command).toBe('codex');
});

test('своя команда вводится в поле и запускается по Enter', async ({ page }) => {
  await prepareMonos(page);
  await fakeShell(page);
  await page.goto('/');
  await page.keyboard.press('Control+`');
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 30000 });

  await page.getByTestId('agent-menu').click();
  await page.getByTestId('agent-choice-custom').click();
  const input = page.getByTestId('agent-custom-input');
  await expect(input).toBeFocused();
  await input.fill('mytool --fast');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__typed)).toContain('mytool --fast\r');
  await expect(page.getByTestId('agent-custom-row')).toHaveCount(0);

  // Esc closes the field without running anything.
  await page.getByTestId('agent-menu').click();
  await page.getByTestId('agent-choice-custom').click();
  await page.getByTestId('agent-custom-input').fill('never');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('agent-custom-row')).toHaveCount(0);
  expect(await page.evaluate(() => window.__typed)).not.toContain('never\r');
});

test('в настройках агенты со значками, найденные первыми', async ({ page }) => {
  await prepareMonos(page);
  await fakeShell(page);
  await page.goto('/settings');
  const section = page.getByTestId('agent-section');
  await expect(section.getByTestId('agent-option-codex')).toHaveAttribute('data-installed', 'true');
  await expect(section.getByTestId('agent-option-gemini')).toHaveAttribute('data-installed', 'false');
  const order = await section.locator('[data-testid^="agent-option-"]').evaluateAll((items) => items.map((item) => item.dataset.testid));
  expect(order.indexOf('agent-option-aider')).toBeLessThan(order.indexOf('agent-option-gemini'));
  // A mark of the agent's own, not one robot for all.
  await expect(section.getByTestId('agent-option-codex').locator('svg[data-agent="codex"]')).toBeVisible();
  await expect(section.getByTestId('agent-option-claude').locator('svg[data-agent="claude"]')).toBeVisible();
});
