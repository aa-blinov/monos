import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { closeDb } from './database.js';
import { ROOT_DIR, NOTES_DIR } from './config.js';
import { indexAllFiles } from './indexing.js';
import { registerFileRoutes } from './routes/files.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerGitRoutes } from './routes/git.js';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function getAllowedOrigins() {
  return new Set((process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function isAllowedOrigin(origin) {
  return !origin || getAllowedOrigins().has(origin);
}

function rejectCrossOriginRequests(req, res, next) {
  const origin = req.get('Origin');
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ detail: 'Origin not allowed' });
  }
  next();
}

const app = express();
app.use(rejectCrossOriginRequests);
app.use(cors({
  origin(origin, callback) {
    callback(null, origin && isAllowedOrigin(origin) ? origin : false);
  },
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

registerFileRoutes(app);
registerAttachmentRoutes(app);
registerGitRoutes(app);

let server = null;
let signalHandlersRegistered = false;
let frontendStaticRegistered = false;

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

export function startServer({ port = 8000 } = {}) {
  if (server) {
    return Promise.resolve({ app, server, port: server.address().port });
  }

  indexAllFiles();
  registerFrontendStatic();
  registerSignalHandlers();

  return new Promise((resolve, reject) => {
    const nextServer = app.listen(port, () => {
      server = nextServer;
      resolve({ app, server, port: server.address().port });
    });

    nextServer.on('error', reject);
  });
}

export function stopServer() {
  return new Promise((resolve) => {
    closeDb();

    if (!server) {
      resolve();
      return;
    }

    const activeServer = server;
    server = null;
    activeServer.close(() => resolve());
  });
}

export { app, indexAllFiles, ROOT_DIR, NOTES_DIR };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const PORT = 8000;
  startServer({ port: PORT })
    .then(() => {
      console.log(`Monos backend running on http://localhost:${PORT}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
