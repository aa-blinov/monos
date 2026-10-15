import {
  bindHostFor,
  networkUrls,
  readLanConfig,
  regenerateLanToken,
  setLanEnabled,
} from '../lan-access.js';
import { requireThisComputer } from './helpers.js';

// Access from other devices is switched and read only on this computer: the token is shown
// here and never to a device that got in with it. A change takes effect for requests at once,
// but the address the server listens on follows the setting only after a restart.
export function registerLanRoutes(app, { listening }) {
  function lanState() {
    const config = readLanConfig();
    const current = listening();
    return {
      enabled: config.enabled,
      token: config.enabled ? config.token : null,
      urls: config.enabled && config.token && current ? networkUrls(current.port, config.token) : [],
      restartRequired: Boolean(current) && bindHostFor(config) !== current.host,
    };
  }

  app.get('/api/lan', requireThisComputer, (req, res) => {
    res.json(lanState());
  });

  app.put('/api/lan', requireThisComputer, (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
      res.status(400).json({ detail: 'enabled must be true or false' });
      return;
    }
    setLanEnabled(req.body.enabled);
    res.json(lanState());
  });

  app.post('/api/lan/token', requireThisComputer, (req, res) => {
    regenerateLanToken();
    res.json(lanState());
  });
}
