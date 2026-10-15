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

The connection is plain HTTP, so traffic on the network is not encrypted, and anyone who can read that network can read the token and the notes. Turn access on only in a network you trust. Monos does not serve HTTPS itself, and a tunnel or reverse proxy in front of it is not safe (see Android below).

## Installing on a phone

The manifest, the icons and the offline page are tested in Chromium and WebKit emulation. Installation on a real iPhone or Android phone has not been tested yet.

### iPhone (Safari)

1. Turn access on, restart Monos and copy the link with the token from the settings.
2. On the phone, on the same Wi-Fi, open the link in Safari. Monos opens.
3. Tap Share → Add to Home Screen.
4. Open Monos from the home screen.

A home-screen app keeps its own cookies. Safari copies a site's cookies once, when the site is saved to the home screen, so open the link in Safari before saving. Cookies in a home-screen app can disappear after a period without use; this is reported in WebKit bug reports and is not checked here. If the app asks for the token again, open the link in Safari.

### Android (Chrome)

Chrome installs a web app only from a secure origin: HTTPS with a certificate the phone trusts, or this computer. Over plain HTTP on the network Chrome offers only a shortcut to the page.

Monos does not serve HTTPS yet. Two routes are possible, and neither is built or tested:

- **Tailscale.** `tailscale cert` issues a certificate that Chrome trusts for the machine's `*.ts.net` name, and Tailscale encrypts the traffic as well. Monos would need its own HTTPS listener with that certificate, and its host check would have to accept that name; today it accepts only IP addresses and `.local` names. The certificate's name appears in public certificate transparency logs.
- **A private CA (mkcert).** The phone must trust the CA. Whether Chrome on Android accepts a user-installed CA for installation was not confirmed. Anyone who holds the CA's key can sign certificates for any name, so copy only the public `rootCA.pem` to the phone and keep the key private.

Do not put a reverse proxy or tunnel in front of Monos, for example `tailscale serve`, cloudflared or ngrok. The server treats every request from 127.0.0.1 as coming from this computer, so a proxy on the same machine lets other devices skip the token and reach `/api/lan`.

The service worker (`public/sw.js`) is registered only in a production build served over HTTPS. It keeps no copy of the notes: every request goes to the network, and only a page load that cannot reach this computer gets a short note instead of the browser's error page.

References: [Tailscale: enabling HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates), [MDN: making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_Installable), [WebKit bug 181849: home-screen apps don't share storage with Safari](https://bugs.webkit.org/show_bug.cgi?id=181849).

## Where it lives

- `webui/backend/lan-access.js`: the settings file, the Host check, the token rules and the cookie.
- `webui/backend/index.js`: `rejectForeignHosts` and `requireAccessToken` run before every route, and `startServer` binds to the address the setting asks for.
- `webui/backend/routes/lan.js`: `GET /api/lan`, `PUT /api/lan`, `POST /api/lan/token`, all for this computer only.
- `webui/frontend/src/components/Settings.svelte`: the section.
