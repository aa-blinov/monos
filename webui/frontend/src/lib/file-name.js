/**
 * Names of notes, folders and attachments: only what any operating system can create.
 *
 * The rules are Windows' — the strictest of the three — so a name that opens nowhere
 * is not created here either. The backend enforces the same rules (webui/backend/utils.js);
 * this module lets a form say what is wrong before the request goes out.
 */

const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_NAME_BYTES = 200;

export const FORBIDDEN_NAME_CHARACTERS = '< > : " / \\ | ? *';

/**
 * null when the name can be created everywhere, otherwise the first problem found:
 * empty, forbidden-characters, edge-dot-or-space, reserved or too-long.
 */
export function fileNameProblem(name) {
  const value = String(name ?? '');
  if (value.trim() === '') return 'empty';
  if (FORBIDDEN_CHARS.test(value)) return 'forbidden-characters';
  if (/[. ]$/.test(value)) return 'edge-dot-or-space';
  if (RESERVED_WINDOWS_NAME.test(value.replace(/\.[^.]*$/, ''))) return 'reserved';
  if (new TextEncoder().encode(value).length > MAX_NAME_BYTES) return 'too-long';
  return null;
}
