import { publishSite } from '../publish-site.js';
import { sendError } from './helpers.js';

// Writes the notes as a static site into a folder the person chooses. Only that folder is written.
export function registerPublishRoutes(app) {
  app.post('/api/publish', (req, res) => {
    try {
      const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
      const folder = typeof req.body?.folder === 'string' ? req.body.folder : '';
      res.json(publishSite({ target, folder }));
    } catch (error) {
      sendError(res, error);
    }
  });
}
