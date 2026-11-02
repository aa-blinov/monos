import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ICONS, OTHER_ICON, agentIcon } from './agent-icons.js';
import { AGENTS } from './agents.js';

test('у каждого агента из каталога есть значок, и лишних значков нет', () => {
  assert.deepEqual(Object.keys(AGENT_ICONS).sort(), AGENTS.map((agent) => agent.id).sort());
});

test('цвета — hex, фон и знак различимы, разметка без скриптов и внешних ссылок', () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const [id, icon] of Object.entries({ ...AGENT_ICONS, other: OTHER_ICON })) {
    assert.match(icon.bg, /^#[0-9A-F]{6}$/i, id);
    assert.match(icon.fg, /^#[0-9A-F]{6}$/i, id);
    assert.ok(Math.abs(luminance(icon.bg) - luminance(icon.fg)) > 0.3, `${id}: the glyph must stand out from its colour`);
    assert.doesNotMatch(icon.body, /<script|href=|src=|url\(|on\w+=/i, id);
  }
});

test('неизвестный агент получает нейтральный значок', () => {
  assert.equal(agentIcon('claude'), AGENT_ICONS.claude);
  assert.equal(agentIcon(undefined), OTHER_ICON);
  assert.equal(agentIcon('nope'), OTHER_ICON);
});
