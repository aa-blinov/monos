import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ROOT_DIR } from './config.js';

// Access from other devices (opt-in). Off by default: the server listens on this computer only. When the
// person turns it on, the server listens on the network, and every request that does not come from this
// computer must carry the access token. The token is shown only to this computer, never to another device.

export const ACCESS_COOKIE = 'monos_token';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CONFIG_FILE = path.join(ROOT_DIR, 'lan-access.json');
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

let cached = null;

function defaults() {
  return { enabled: false, token: null };
}

/** The settings as they are on disk (read once, then kept in memory; the server is their only writer). */
export function readLanConfig() {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    cached = {
      enabled: parsed.enabled === true,
      token: typeof parsed.token === 'string' && parsed.token.length >= 32 ? parsed.token : null,
    };
  } catch {
    cached = defaults();
  }
  return cached;
}

function writeLanConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  cached = { ...config };
  return cached;
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Turns access from other devices on or off. Turning it on makes a token if there is none yet. */
export function setLanEnabled(enabled) {
  const current = readLanConfig();
  return writeLanConfig({
    enabled: Boolean(enabled),
    token: current.token || newToken(),
  });
}

/** A new token: the devices that had the old one lose access. */
export function regenerateLanToken() {
  const current = readLanConfig();
  return writeLanConfig({ enabled: current.enabled, token: newToken() });
}

/** The address the server listens on: this computer only, unless the person turned network access on. */
export function bindHostFor(config = readLanConfig()) {
  return config.enabled ? '0.0.0.0' : '127.0.0.1';
}

export function isLoopbackAddress(address) {
  const value = String(address || '');
  return value === '::1' || value === '::ffff:127.0.0.1' || value.startsWith('127.');
}

/**
 * Whether a Host header may reach the server. Loopback names always may. A network address (an IP
 * literal or a `.local` name) may only when network access is on. A DNS name never may: a DNS-rebinding
 * page reaches the server under such a name.
 */
export function hostAllowed(hostname, lanEnabled) {
  const name = String(hostname || '').toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(name)) return true;
  if (!lanEnabled) return false;
  return IPV4.test(name) || name.endsWith('.local');
}

function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Whether a request may go on. This computer always may. Another device must give the token: in the
 * cookie it got earlier, in a bearer header, or — only for the first page load — in the `token` query.
 */
export function requestAuthorized({ remoteAddress, config, cookieToken, bearerToken, queryToken, pathname }) {
  if (isLoopbackAddress(remoteAddress)) return true;
  if (!config.enabled) return false;
  if (tokenMatches(cookieToken, config.token)) return true;
  if (tokenMatches(bearerToken, config.token)) return true;
  return pathname === '/' && tokenMatches(queryToken, config.token);
}

/** The addresses another device can open this computer at, with the token in the link. */
export function networkUrls(port, token) {
  const urls = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}/?token=${encodeURIComponent(token)}`);
      }
    }
  }
  return urls;
}

export function accessCookie(token) {
  return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function readCookie(header, name) {
  const pairs = String(header || '').split(';');
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index !== -1 && pair.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(pair.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
