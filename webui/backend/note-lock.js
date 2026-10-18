import crypto from 'crypto';
import { httpError } from './utils.js';

// Locked notes (opt-in). A locked note is still a note file: its frontmatter says `monos-locked: true`, and
// the rest of the file is one sealed envelope — the whole original text, encrypted with AES-256-GCM under a
// key derived from a passphrase with scrypt. Nothing is written in plain text until the person removes the
// lock. The key stays in memory for the session (see rememberSession); a restart needs the passphrase again.

const ALGORITHM = 'aes-256-gcm';
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const BEGIN = '-----BEGIN MONOS LOCKED NOTE-----';
const END = '-----END MONOS LOCKED NOTE-----';
const DAMAGED = 'The locked note is damaged';

function frontmatterOf(text) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  // Lines that are not YAML mean the opening `---` was a horizontal rule, not a header.
  const first = match && match[1].split(/\r?\n/).find((line) => line.trim() !== '');
  const yaml = match && (first === undefined || /^#/.test(first) || /^[^\s:][^:]*:(\s|$)/.test(first) || /^-(\s|$)/.test(first));
  return yaml ? match[1] : null;
}

/** Whether a note's text is a locked note: the frontmatter marker and the sealed block are both there. */
export function isLockedNote(text) {
  const raw = String(text ?? '');
  const frontmatter = frontmatterOf(raw);
  return Boolean(frontmatter && /^monos-locked:\s*true\s*$/m.test(frontmatter) && raw.includes(BEGIN) && raw.includes(END));
}

function deriveKey(passphrase, salt, params) {
  return crypto.scryptSync(String(passphrase ?? ''), salt, 32, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

function sealed(plaintext, session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, session.key, iv);
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const envelope = {
    v: 1,
    kdf: 'scrypt',
    N: session.params.N,
    r: session.params.r,
    p: session.params.p,
    salt: session.salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  const lines = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64').match(/.{1,76}/g) || [''];
  return `---\nmonos-locked: true\n---\n\n${BEGIN}\n${lines.join('\n')}\n${END}\n`;
}

function parseEnvelope(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw httpError(400, DAMAGED);
  let envelope;
  try {
    envelope = JSON.parse(Buffer.from(text.slice(start + BEGIN.length, end).replace(/\s+/g, ''), 'base64').toString('utf8'));
  } catch {
    throw httpError(400, DAMAGED);
  }
  const validParams = envelope && Number.isInteger(envelope.N) && envelope.N >= 2 && envelope.N <= 2 ** 20
    && (envelope.N & (envelope.N - 1)) === 0 && Number.isInteger(envelope.r) && Number.isInteger(envelope.p);
  if (!envelope || envelope.v !== 1 || envelope.kdf !== 'scrypt' || !validParams) {
    throw httpError(400, 'Unsupported lock format');
  }
  return envelope;
}

function decrypt(envelope, key) {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // A wrong passphrase and a changed envelope fail the same way: the tag does not match.
    throw httpError(403, 'The passphrase is wrong');
  }
}

/** Seals the whole text under a new passphrase. Returns the locked file text and the session that can reseal it. */
export function lockContent(plaintext, passphrase) {
  if (!String(passphrase ?? '').length) throw httpError(400, 'Enter a passphrase');
  const salt = crypto.randomBytes(16);
  const session = { salt, params: { ...KDF }, key: deriveKey(passphrase, salt, KDF) };
  return { text: sealed(plaintext, session), session };
}

/** Opens a locked file with its passphrase. Returns the original text and the session for it. */
export function unlockContent(lockedText, passphrase) {
  const envelope = parseEnvelope(String(lockedText));
  const salt = Buffer.from(envelope.salt, 'base64');
  const params = { N: envelope.N, r: envelope.r, p: envelope.p };
  const key = deriveKey(passphrase, salt, params);
  return { plaintext: decrypt(envelope, key), session: { salt, params, key } };
}

/** Opens a locked file with the session key it was unlocked with. */
export function readWithSession(lockedText, session) {
  return decrypt(parseEnvelope(String(lockedText)), session.key);
}

/** Seals new text with the session key, as a save does while the note is unlocked. */
export function sealWithSession(plaintext, session) {
  return sealed(plaintext, session);
}

// Keys of the notes unlocked in this session, by note path. Nothing about them is written to disk.
const sessions = new Map();

export function rememberSession(notePath, session) {
  sessions.set(notePath, session);
}

export function sessionFor(notePath) {
  return sessions.get(notePath) || null;
}

export function forgetSession(notePath) {
  sessions.delete(notePath);
}

// A note that moved keeps its key, and so does every note inside a folder that moved.
export function moveSession(oldPath, newPath) {
  for (const key of [...sessions.keys()]) {
    if (key === oldPath || key.startsWith(`${oldPath}/`)) {
      const session = sessions.get(key);
      sessions.delete(key);
      sessions.set(newPath + key.slice(oldPath.length), session);
    }
  }
}
