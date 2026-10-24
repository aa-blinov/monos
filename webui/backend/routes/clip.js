import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NOTES_DIR, ROOT_DIR } from '../config.js';
import { httpError, nowISO, safePathName } from '../utils.js';
import { requireThisComputer, sendError } from './helpers.js';

const TOKEN_BYTES = 32;
const MAX_TITLE = 200;
const MAX_BODY = 500_000;
const MAX_SELECTED = 30;

// Extensions cannot be listed individually (their ids are generated at install
// time), so the scheme is matched instead. The bearer token below is the real
// gate: without it, knowing that the app runs on some port buys nothing.
const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i;

function tokenPath() {
  return path.join(ROOT_DIR, '.data', 'clipper-token');
}

function ensureToken() {
  const file = tokenPath();
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // no token yet — create one below
  }
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 0600: the token is the only thing standing between a stray local process and
  // the user's notes.
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort on platforms without POSIX modes
  }
  return token;
}

function presentedToken(req) {
  const bearer = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return bearer || String(req.get('X-Monos-Clip-Token') || '').trim();
}

function tokenMatches(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeOrigin(origin) {
  return origin ? String(origin).replace(/\/$/, '') : '';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A slug that is not taken yet.
 *
 * The extension is part of the candidate being tested: checking the bare slug
 * would never match `slug.md` on disk, and two clips with the same title would
 * silently overwrite one another.
 */
function uniquePath(slug, extension) {
  let candidate = `${slug}${extension}`;
  let counter = 2;
  while (fs.existsSync(path.join(NOTES_DIR, candidate))) {
    candidate = `${slug}-${counter}${extension}`;
    counter += 1;
  }
  return candidate;
}

function resolveClipFolder(rawFolder) {
  const folder = String(rawFolder || '').trim();
  if (!folder) return NOTES_DIR;
  const target = path.resolve(NOTES_DIR, folder);
  const notesRoot = path.resolve(NOTES_DIR);
  if (target !== notesRoot && !target.startsWith(notesRoot + path.sep)) {
    throw httpError(403, 'Folder must stay inside notes', 'outside_notes');
  }
  // `.git` and the app's own folders are not places for a clip.
  if (path.relative(notesRoot, target).split(path.sep).some((segment) => segment.startsWith('.'))) {
    throw httpError(403, 'This folder is not available', 'hidden_path');
  }
  return target;
}

function buildClippedMarkdown({ title, source, selected, content }) {
  const front = [
    '---',
    `title: ${JSON.stringify(title || '(no title)')}`,
    source ? `source: ${JSON.stringify(source)}` : null,
    `clipped: ${nowISO()}`,
    '---',
    '',
  ].filter((line) => line !== null).join('\n');

  const quote = selected
    .map((chunk) => `> ${String(chunk).replace(/\n/g, '\n> ')}`)
    .join('\n\n');

  return [front, quote, content].filter(Boolean).join('\n\n').trimEnd();
}

/**
 * Web clipper intake.
 *
 *   GET  /api/clip/token   show the current token (app origin only)
 *   POST /api/clip/notes   create a note from the extension
 *
 * The global Origin filter in index.js exempts this path so a browser extension
 * can reach it at all; origin and token are both re-checked here, and the token
 * is required for every write.
 *
 * There is no global Express error handler, so each handler catches its own
 * errors — otherwise Express would render a thrown httpError as an HTML page
 * containing this module's absolute path.
 */
export function registerClipRoutes(app, { appOrigins } = {}) {
  const token = ensureToken();
  // Resolved per request, not captured here: Electron imports this module
  // before it knows the port it will bind, so ALLOWED_ORIGINS is only set
  // afterwards. A captured list would hold the dev defaults and reject the
  // app's own origin in a packaged build.
  const isAppOrigin = (origin) => {
    const sources = typeof appOrigins === 'function' ? appOrigins() : (appOrigins || []);
    return new Set(sources.map(normalizeOrigin)).has(origin);
  };

  // The token is the key to writing notes from outside, so it is shown to this computer only. The access token of
  // other devices does not reach here (the path is exempt from it), and a request that came across the network, or
  // through a proxy, carries no right to read it: without an Origin header it used to be handed to anyone.
  app.get('/api/clip/token', requireThisComputer, (req, res) => {
    try {
      const origin = normalizeOrigin(req.get('Origin'));
      // Reading the token is not gated by it, so it is limited to the app itself.
      if (origin && !isAppOrigin(origin)) {
        throw httpError(403, 'Token is only visible inside the app');
      }
      res.json({ token });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/clip/notes', (req, res) => {
    try {
      const origin = normalizeOrigin(req.get('Origin'));
      if (origin && !isAppOrigin(origin) && !EXTENSION_ORIGIN.test(origin)) {
        throw httpError(403, 'Origin not allowed');
      }
      if (!tokenMatches(presentedToken(req), token)) {
        throw httpError(401, 'Invalid clipper token');
      }

      const body = typeof req.body?.content === 'string' ? req.body.content.slice(0, MAX_BODY) : '';
      const title = String(req.body?.title || '').trim().slice(0, MAX_TITLE);
      const source = String(req.body?.sourceUrl || '').trim().slice(0, 1000);
      const selected = Array.isArray(req.body?.selectedText)
        ? req.body.selectedText.slice(0, MAX_SELECTED)
        : [];

      if (!title && !body) throw httpError(400, 'Nothing to clip');

      const dir = resolveClipFolder(req.body?.folder);
      fs.mkdirSync(dir, { recursive: true });

      const fileName = uniquePath(slugify(title) || `clip-${Date.now()}`, '.md');
      const absolute = path.join(dir, fileName);
      fs.writeFileSync(
        absolute,
        `${buildClippedMarkdown({ title, source, selected, content: body })}\n`,
        'utf8',
      );

      const relative = path.relative(NOTES_DIR, absolute).split(path.sep).join('/');
      res.status(201).json({ path: `notes/${relative}`, title: title || safePathName(fileName, '.md') });
    } catch (error) {
      sendError(res, error);
    }
  });
}
