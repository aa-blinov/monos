import './repair-location.js'
// The kit's FieldControl renders `<input>` through `<svelte:element>` with an (empty) children block, which the
// Svelte dev runtime reports on every field. Production builds say nothing; here the development console is kept
// readable until the kit renders `<input>` on its own (the warning names the element and nothing else).
if (import.meta.env.DEV) {
  const warn = console.warn.bind(console)
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && /<svelte:element this="input">.*self-closing/.test(args[0])) return
    warn(...args)
  }
}

import App from './App.svelte'
import './app.css'
import { shouldRegisterServiceWorker } from './lib/service-worker.js'
import { installTooltips } from './lib/tooltip.js'

const app = new App({
  target: document.getElementById('app'),
})

// Every title= in the app shows as the app's own tooltip, not the system's.
installTooltips(document)

if (shouldRegisterServiceWorker({
  production: import.meta.env.PROD,
  secureContext: window.isSecureContext,
  protocol: window.location.protocol,
  supported: 'serviceWorker' in navigator,
})) {
  navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Service worker registration failed:', error))
}

export default app
