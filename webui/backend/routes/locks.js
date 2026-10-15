import fs from 'fs';
import { getDb } from '../database.js';
import { httpError, readTextFile, resolveNotesPath } from '../utils.js';
import { indexFile } from '../indexing.js';
import { rewriteNoteFile } from '../link-rename.js';
import { forgetSession, isLockedNote, lockContent, rememberSession, unlockContent } from '../note-lock.js';
import { requireQueryPath } from './validate.js';
import { sendError } from './helpers.js';

// Locking is opt-in and explicit: a note is sealed with a passphrase only when the person asks for it, and
// it goes back to plain text only when they ask to remove the lock.

function noteFile(filePath) {
  const fullPath = resolveNotesPath(filePath);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) throw httpError(404, 'File not found');
  const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
  if (note?.trashed_at) throw httpError(410, 'File is in trash');
  return fullPath;
}

function passphraseOf(req) {
  const passphrase = req.body?.passphrase;
  if (typeof passphrase !== 'string' || passphrase.length === 0) throw httpError(400, 'Enter the passphrase');
  return passphrase;
}

function writeKeepingTime(fullPath, text) {
  const { atime, mtime } = fs.statSync(fullPath);
  fs.writeFileSync(fullPath, text, 'utf-8');
  fs.utimesSync(fullPath, atime, mtime);
}

export function registerLockRoutes(app) {
  // Seals the note with a passphrase. It stays open for this session, and a restart asks for the passphrase.
  app.post('/api/file/lock', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const fullPath = noteFile(filePath);
      const passphrase = passphraseOf(req);
      if (isLockedNote(readTextFile(fullPath))) throw httpError(400, 'The note is already locked');
      let session = null;
      rewriteNoteFile(fullPath, (text) => {
        const locked = lockContent(text, passphrase);
        session = locked.session;
        return { content: locked.text, count: 1 };
      });
      rememberSession(filePath, session);
      indexFile(fullPath, readTextFile(fullPath));
      res.json({ locked: true, unlocked: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Opens a locked note for this session with its passphrase.
  app.post('/api/file/unlock', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const fullPath = noteFile(filePath);
      const stored = readTextFile(fullPath);
      if (!isLockedNote(stored)) throw httpError(400, 'The note is not locked');
      const { session } = unlockContent(stored, passphraseOf(req));
      rememberSession(filePath, session);
      res.json({ locked: true, unlocked: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Closes the note again: until it is unlocked with its passphrase, its text cannot be read.
  app.post('/api/file/relock', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const fullPath = noteFile(filePath);
      if (!isLockedNote(readTextFile(fullPath))) throw httpError(400, 'The note is not locked');
      forgetSession(filePath);
      res.json({ locked: true, unlocked: false });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Removes the lock: the note is written back as plain text. This is the only way its text leaves the seal.
  app.post('/api/file/unprotect', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const fullPath = noteFile(filePath);
      const stored = readTextFile(fullPath);
      if (!isLockedNote(stored)) throw httpError(400, 'The note is not locked');
      const { plaintext } = unlockContent(stored, passphraseOf(req));
      writeKeepingTime(fullPath, plaintext);
      forgetSession(filePath);
      indexFile(fullPath, plaintext);
      res.json({ locked: false, unlocked: false });
    } catch (error) {
      sendError(res, error);
    }
  });
}
