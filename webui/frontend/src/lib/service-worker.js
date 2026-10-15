// Whether the app registers its service worker (public/sw.js). Only in a production build on HTTPS: on this
// computer and on a plain-HTTP network address browsers do not install a web app from a service worker,
// and the app needs nothing from one there.
export function shouldRegisterServiceWorker({ production, secureContext, protocol, supported }) {
  return Boolean(production && secureContext && protocol === 'https:' && supported);
}
