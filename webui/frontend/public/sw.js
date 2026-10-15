// Monos installed from a secure address keeps no copy of the notes: every request goes to the
// network. The worker adds only one thing: when this computer cannot be reached, a page load
// shows a short note in place of the browser's error page.
const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Monos</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:#282828;color:#ebdbb2;font:16px/1.5 system-ui,sans-serif;text-align:center}</style>
</head><body><p>Monos не отвечает. Откройте Monos на этом компьютере и попробуйте снова.<br>Monos is not reachable. Open Monos on this computer and try again.</p></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })));
});
