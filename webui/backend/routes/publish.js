import { publishSite } from '../publish-site.js';
import { requireThisComputer, sendError } from './helpers.js';

// Writes the notes as a static site into a folder the person chooses. Only that folder is written.
export function registerPublishRoutes(app) {
  // A folder to write into is a folder of this computer: only a request from it may name one.
  app.post('/api/publish', requireThisComputer, (req, res) => {
    try {
      const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
      const folder = typeof req.body?.folder === 'string' ? req.body.folder : '';
      res.json(publishSite({ target, folder }));
    } catch (error) {
      sendError(res, error);
    }
  });
}
