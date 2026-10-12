# Monos Clipper

Sends the page you are reading, or the text you have selected, into your
Monos notes folder as Markdown.

## How it works

The extension does not talk to the app's UI. It posts JSON to a single local
endpoint:

```
POST http://127.0.0.1:<port>/api/clip/notes
X-Monos-Clip-Token: <token>
Content-Type: application/json
```

Every write requires the token, and the backend also checks the `Origin`
header: only your app, or a browser extension, is accepted. A token alone is
not enough to reach the rest of the API, and neither is a page in your browser.

The endpoint is deliberately reachable by extension origins, which cannot be
enumerated in advance because their ids are generated at install time. That is
safe only because the token gates every write.

## Install

The extension is unpacked — there is no store build.

1. In Monos: **Settings → Web clipper → Show token**. Copy it.
2. Note the app address shown next to the token (for example
   `http://127.0.0.1:8000`). In a packaged desktop build the port differs; the
   address on the Settings screen is the one to use.
3. Open the browser's extension page:
   - Chrome / Edge: `chrome://extensions`
   - Firefox: `about:debugging#/runtime/this-firefox`
4. Turn on developer mode, choose **Load unpacked** / **Load Temporary Add-on**,
   and select this `clipper/` directory.
5. Click the extension icon, paste the token and address, then use
   **Clip selection** or **Clip whole page**.

## What it saves

```markdown
---
title: "Page title"
source: "https://example.com/post"
clipped: 2026-10-11T10:52:00.607Z
---

> the text you had selected

the readable text of the page
```

Notes land in the folder you type in the popup, `clips` by default. Nothing is
uploaded anywhere: the page is read in your browser and written straight to the
local file.

## Rotating the token

Delete `.data/clipper-token` in your data directory and restart the app. A new
token is generated on next start; the old one stops working immediately.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, host permissions limited to loopback |
| `popup.html` / `popup.css` / `popup.js` | The popup: settings, clip buttons, readable-text extraction |
| `background.js` | Service worker placeholder |
| `icon.svg` | Copied from the application icon |