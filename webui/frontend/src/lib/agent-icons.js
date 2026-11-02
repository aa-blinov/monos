/**
 * A mark for each agent in the catalogue: a rounded square in the agent's own colour with a simple glyph on it.
 * They are drawn here, not downloaded, so the app has no remote assets; the glyphs are simplified (a spark, a
 * sparkle, a prompt) rather than the companies' exact logos. `body` is static SVG on a 24 by 24 canvas and is
 * written by hand in this file, never built from anything the person or a note typed.
 */
const stroke = (d, width = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d) => `<path d="${d}" fill="currentColor"/>`;
const letters = (text, size = 13) => `<text x="12" y="${12 + size * 0.36}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${size}" font-weight="700" fill="currentColor">${text}</text>`;

export const AGENT_ICONS = {
  claude: { bg: '#D97757', fg: '#FFFFFF', body: stroke('M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7', 2.2) },
  codex: { bg: '#5B6CFF', fg: '#FFFFFF', body: stroke('M7 8.5l3.5 3.5L7 15.5M13 16h4.5', 2.1) },
  gemini: { bg: '#4285F4', fg: '#FFFFFF', body: fill('M12 3c.7 5.3 3.7 8.3 9 9-5.3.7-8.3 3.7-9 9-.7-5.3-3.7-8.3-9-9 5.3-.7 8.3-3.7 9-9z') },
  opencode: { bg: '#2B2B2B', fg: '#F1ECEC', body: '<rect x="7" y="6" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2.2"/>' },
  cursor: { bg: '#171717', fg: '#F4F4F4', body: stroke('M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5zM12 12l7.5-4.25') },
  copilot: { bg: '#8534F3', fg: '#FFFFFF', body: '<rect x="5" y="9" width="5.2" height="6.5" rx="2.6" fill="currentColor"/><rect x="13.8" y="9" width="5.2" height="6.5" rx="2.6" fill="currentColor"/>' },
  qwen: { bg: '#615CED', fg: '#FFFFFF', body: letters('Q') },
  droid: { bg: '#EE6018', fg: '#FFFFFF', body: letters('D') },
  auggie: { bg: '#3FB68B', fg: '#FFFFFF', body: letters('A') },
  vibe: { bg: '#FA520F', fg: '#FFFFFF', body: '<rect x="5.5" y="6.5" width="13" height="2.6" fill="currentColor"/><rect x="5.5" y="10.7" width="13" height="2.6" fill="currentColor"/><rect x="5.5" y="14.9" width="13" height="2.6" fill="currentColor"/>' },
  cline: { bg: '#27272A', fg: '#FAFAFA', body: letters('Cl', 11) },
  aider: { bg: '#17A34A', fg: '#FFFFFF', body: fill('M6 7h12v8h-6.5L8 18.5V15H6z') },
  goose: { bg: '#FFB800', fg: '#1A1A1A', body: letters('G') },
  amp: { bg: '#F34E3F', fg: '#FFFFFF', body: fill('M13.5 3L6 13.2h5L10 21l8-10.5h-5.2z') },
  crush: { bg: '#6B50FF', fg: '#FFFFFF', body: letters('C') },
  kiro: { bg: '#8E47FF', fg: '#FFFFFF', body: '<path d="M6.5 18v-7a5.5 5.5 0 0111 0v7l-2.2-1.8L13.6 18 12 16.2 10.4 18l-1.7-1.8z" fill="currentColor"/><circle cx="10" cy="11" r="1" fill="#8E47FF"/><circle cx="14" cy="11" r="1" fill="#8E47FF"/>' },
  kilo: { bg: '#F4E04D', fg: '#1A1A1A', body: letters('Kc', 11) },
  grok: { bg: '#0A0A0A', fg: '#FFFFFF', body: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' + stroke('M7 17.5l10-11', 2) },
  junie: { bg: '#F43F7A', fg: '#FFFFFF', body: letters('J') },
  codebuff: { bg: '#1FB65A', fg: '#FFFFFF', body: letters('Cb', 11) },
  openhands: { bg: '#F5C518', fg: '#1A1A1A', body: letters('OH', 10.5) },
};

/** A command of the person's own, not in the catalogue. */
export const OTHER_ICON = { bg: '#52525B', fg: '#FAFAFA', body: stroke('M7 8.5l3.5 3.5L7 15.5M13 16h4.5', 2.1) };

export function agentIcon(id) {
  return AGENT_ICONS[id] || OTHER_ICON;
}
