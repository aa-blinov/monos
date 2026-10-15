import App from './App.svelte'
import './app.css'
import { shouldRegisterServiceWorker } from './lib/service-worker.js'

const app = new App({
  target: document.getElementById('app'),
})

if (shouldRegisterServiceWorker({
  production: import.meta.env.PROD,
  secureContext: window.isSecureContext,
  protocol: window.location.protocol,
  supported: 'serviceWorker' in navigator,
})) {
  navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Service worker registration failed:', error))
}

export default app
