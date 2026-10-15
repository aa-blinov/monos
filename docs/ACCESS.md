# Access From Other Devices

Monos runs on one computer and keeps the notes there. By default only that computer can reach it.

To open Monos from a phone or another computer on the same network, turn on **Settings → Phone and other devices → Allow access from other devices**. The page then lists the addresses this computer has on the network, each with the access token in the link. Restart Monos once after turning access on or off: the server listens on the network only from the start.

## What a device needs

- The link. Opening it once sets a cookie that keeps the device signed in for 30 days. The token leaves the address bar at once, so it is not kept in the browser history.
- Or an `Authorization: Bearer <token>` header, for scripts on another machine.

Only the first page load accepts the token in the address. Every other request needs the cookie or the header, so a link pasted into an API call does not work.

## What is protected

- **Host header.** The server answers only to the names it knows: `localhost` and `127.0.0.1` always, and the network addresses or a `.local` name while access is on. A DNS name is refused even with a token, which blocks pages that try to reach the server under a name of their own (DNS rebinding).
- **This computer is trusted.** Requests from it never need a token.
- **Settings are changed only here.** `/api/lan` answers only to this computer, so a device that got in cannot read the token or switch access on.
- **A new token** (Settings → Phone and other devices → New token) ends the access of every device that has the old one.
- **Turning access off** refuses other devices at once, even before the restart.
- **The clipper** keeps its own bearer token (`routes/clip.js`), so it is not affected by the network check.

The token lives in `lan-access.json` in the notes root, readable only by the owner (mode `600`).

## What is not protected

The connection is plain HTTP, so traffic on the network is not encrypted, and anyone who can read that network can read the token and the notes. Turn access on only in a network you trust. There is no HTTPS in Monos itself; putting a tunnel with HTTPS in front of it is up to you.

## Installing the web app

The app ships a web app manifest and icons (`webui/frontend/public`), so a browser can offer to add it to the home screen:

- iOS Safari: Share → Add to Home Screen opens Monos in its own window.
- Android Chrome and desktop browsers install a web app only from a secure address (HTTPS or this computer). Over plain HTTP on the network they add a shortcut to the page instead.

The service worker (`public/sw.js`) is registered only in a production build served over HTTPS. It keeps no copy of the notes: every request goes to the network, and only a page load that cannot reach this computer gets a short note instead of the browser's error page.

## Where it lives

- `webui/backend/lan-access.js`: the settings file, the Host check, the token rules and the cookie.
- `webui/backend/index.js`: `rejectForeignHosts` and `requireAccessToken` run before every route, and `startServer` binds to the address the setting asks for.
- `webui/backend/routes/lan.js`: `GET /api/lan`, `PUT /api/lan`, `POST /api/lan/token`, all for this computer only.
- `webui/frontend/src/components/Settings.svelte`: the section.
