import { get } from './api/client.js';

const THEME_MODES = ['system', 'light', 'dark'];

/**
 * Load shell settings (theme, themeMode) from the server.
 * Returns null on any failure, never throws.
 *
 * @param {{ [k: string]: any }} themes - the themes map for validation
 * @returns {Promise<{ theme?: string, themeMode?: string } | null>}
 */
export async function loadShellSettings(themes) {
  try {
    const settings = await get('/api/settings');
    if (!settings || typeof settings !== 'object') return null;

    const result = {};
    if (themes && settings.theme && themes[settings.theme]) {
      result.theme = settings.theme;
    }
    if (THEME_MODES.includes(settings.themeMode)) {
      result.themeMode = settings.themeMode;
    }
    return result;
  } catch {
    return null;
  }
}
