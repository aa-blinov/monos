import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { closeDb } from './database.js';
import { ROOT_DIR, NOTES_DIR } from './config.js';
import { indexAllFiles } from './indexing.js';
import { ensureAgentSkill } from './agent-skill.js';
import { registerFileRoutes } from './routes/files.js';
import { registerTreeRoutes } from './routes/tree.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerDirectoryRoutes } from './routes/directories.js';
import { registerAttachmentRoutes, registerOrphanRoutes } from './routes/attachments.js';
import { registerGitRoutes } from './routes/git.js';
import { registerSavedSearchRoutes } from './routes/saved-searches.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerPrintRoutes } from './routes/print.js';
import { registerClipRoutes } from './routes/clip.js';
import { registerPublishRoutes } from './routes/publish.js';
import { registerLockRoutes } from './routes/locks.js';
import { registerLanRoutes } from './routes/lan.js';
import { registerStorageRoutes } from './routes/storage.js';
import { registerEventRoutes, startNotesWatcher, stopNotesWatcher } from './watcher.js';
import { registerAgentRoutes } from './routes/agent.js';
import {
  ACCESS_COOKIE,
  accessCookie,
  bindHostFor,
  hostAllowed,
  isThisComputerRequest,
  readCookie,
  readLanConfig,
  requestAuthorized,
} from './lan-access.js';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
// Notes are plain text, but one long note is still one JSON body. The default
// 100 kB limit answered 413 to saves of longer notes, so they never reached disk.
const JSON_BODY_LIMIT = '20mb';
const SHUTDOWN_GRACE_MS = 5000;

function getAllowedOrigins() {
  return new Set((process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function isAllowedOrigin(origin) {
  return !origin || getAllowedOrigins().has(origin);
}

// The server listens on this computer only, unless the person turned access from other
// devices on (lan-access.js). Checking the Host header also rejects DNS-rebinding pages:
// they reach this server under their own host name, and a same-origin request from them
// carries no Origin header to refuse.
function rejectForeignHosts(req, res, next) {
  if (!hostAllowed(req.hostname, readLanConfig().enabled)) {
    return res.status(403).json({ detail: 'Host not allowed' });
  }
  next();
}

// The clipper is reached by a browser extension, whose Origin is an extension
// scheme that cannot be enumerated ahead of install. Allowing those schemes
// globally would let any installed extension read the notes API, so the path is
// exempted here and re-checked — origin *and* a bearer token — inside
// routes/clip.js, where the extension schemes are the only extra thing allowed.
const EXEMPT_PREFIXES = ['/api/clip/'];

// A page this server serves has this server's own origin, and browsers send that
// origin on module scripts and stylesheets as well as on API calls. The Host check
// has already limited the request to loopback, so this origin can only be ours.
function isOwnOrigin(req) {
  const origin = req.get('Origin');
  return Boolean(origin) && origin.toLowerCase() === `${req.protocol}://${req.get('Host')}`.toLowerCase();
}

function rejectCrossOriginRequests(req, res, next) {
  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }
  const origin = req.get('Origin');
  if (!isOwnOrigin(req) && !isAllowedOrigin(origin)) {
    return res.status(403).json({ detail: 'Origin not allowed' });
  }
  next();
}

const ACCESS_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Monos</title></head>
<body style="font: 16px/1.5 system-ui, sans-serif; margin: 16px;">
<p>Откройте ссылку с токеном, которую показывает Monos на вашем компьютере: Настройки → Телефон и другие устройства.</p>
<p>Open the link with the access token that Monos shows on your computer: Settings → Phone and other devices.</p>
</body></html>`;

// Another device gets in with the access token. Its first page load carries the token in
// the link; the server answers with a cookie and sends the page back without the token in
// the address. This computer never needs it. The clipper checks its own token (routes/clip.js).
function requireAccessToken(req, res, next) {
  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }
  const authorization = String(req.get('Authorization') || '');
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const authorized = requestAuthorized({
    remoteAddress: req.socket.remoteAddress,
    headers: req.headers,
    config: readLanConfig(),
    cookieToken: readCookie(req.get('Cookie'), ACCESS_COOKIE),
    bearerToken: authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null,
    queryToken,
    pathname: req.path,
  });
  if (!authorized) {
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ detail: 'Access token required' });
    } else {
      res.status(401).type('html').send(ACCESS_PAGE);
    }
    return;
  }
  if (queryToken && req.method === 'GET' && req.path === '/' && !isThisComputerRequest({ remoteAddress: req.socket.remoteAddress, headers: req.headers })) {
    res.setHeader('Set-Cookie', accessCookie(queryToken));
    res.redirect(302, '/');
    return;
  }
  next();
}

const app = express();
app.use(rejectForeignHosts);
app.use(rejectCrossOriginRequests);
app.use(requireAccessToken);
app.use(cors({
  origin(origin, callback) {
    callback(null, origin && isAllowedOrigin(origin) ? origin : false);
  },
}));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

registerFileRoutes(app);
registerTreeRoutes(app);
registerNoteRoutes(app);
registerConnectionRoutes(app);
registerDirectoryRoutes(app);
registerAttachmentRoutes(app);
registerOrphanRoutes(app);
registerGitRoutes(app);
registerTemplateRoutes(app);
registerSavedSearchRoutes(app);
registerBackupRoutes(app);
registerPrintRoutes(app);
registerClipRoutes(app, { appOrigins: () => [...getAllowedOrigins()] });
registerPublishRoutes(app);
registerLockRoutes(app);

let server = null;
let boundHost = null;
let signalHandlersRegistered = false;
let frontendStaticRegistered = false;

/** The address and port the server listens on now, or null when it does not listen. */
export function currentListening() {
  if (!server) return null;
  return { port: server.address().port, host: boundHost };
}

registerLanRoutes(app, { listening: currentListening });
registerStorageRoutes(app);
registerEventRoutes(app);
registerAgentRoutes(app);

function registerFrontendStatic() {
  if (frontendStaticRegistered) return;
  frontendStaticRegistered = true;

  const frontendDist = process.env.FRONTEND_DIST
    ? path.resolve(process.env.FRONTEND_DIST)
    : '';
  const indexPath = frontendDist ? path.join(frontendDist, 'index.html') : '';

  if (!frontendDist || !fs.existsSync(indexPath)) return;

  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(indexPath);
  });
}

function registerSignalHandlers() {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdown = () => {
    void stopServer();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function startServer({ port = 8000, host } = {}) {
  if (server) {
    return Promise.resolve({ app, server, port: server.address().port });
  }

  // The assistants' guide to this folder, made once and then left alone (a failure here must not stop the app).
  try { ensureAgentSkill(); } catch (error) { console.error('Could not write the agent skill:', error); }
  // An unreadable note is skipped inside the pass (indexing.js); a failure of the pass itself must not stop the app.
  try { indexAllFiles(); } catch (error) { console.error('Could not index the notes:', error); }
  startNotesWatcher();
  registerFrontendStatic();
  registerSignalHandlers();

  const bindHost = host || bindHostFor();
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(port, bindHost, () => {
      server = nextServer;
      boundHost = bindHost;
      resolve({ app, server, port: server.address().port });
    });

    nextServer.on('error', reject);
  });
}

// The HTTP side closes first, so a save still in flight finishes writing before
// the database goes away. A connection that never ends cannot hold shutdown
// open for longer than SHUTDOWN_GRACE_MS.
export function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      closeDb();
      resolve();
      return;
    }

    stopNotesWatcher();
    const activeServer = server;
    server = null;
    boundHost = null;
    const grace = setTimeout(() => activeServer.closeAllConnections?.(), SHUTDOWN_GRACE_MS);
    activeServer.close(() => {
      clearTimeout(grace);
      closeDb();
      resolve();
    });
    activeServer.closeIdleConnections?.();
  });
}

export { app, indexAllFiles, ROOT_DIR, NOTES_DIR };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const PORT = 8000;
  startServer({ port: PORT })
    .then(() => {
      console.log(`Monos backend running on http://127.0.0.1:${PORT}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
