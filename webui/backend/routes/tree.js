import path from 'path';
import { getDb } from '../database.js';

export function registerTreeRoutes(app) {
  app.get('/api/tree', (req, res) => {
    try {
      const db = getDb();

      function buildNode(relativePath) {
        const name = relativePath === 'notes' ? 'notes' : path.basename(relativePath);
        const folderConfig = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(relativePath);
        const children = db.prepare(`
          SELECT * FROM notes_index
          WHERE parent_path = ?
            AND (trashed_at IS NULL OR trashed_at = '')
          ORDER BY is_dir DESC, name COLLATE NOCASE ASC
        `).all(relativePath);

        return {
          path: relativePath,
          name,
          is_dir: true,
          icon: folderConfig?.icon || null,
          color: folderConfig?.color || null,
          size: 0,
          size_human: '',
          children: children.map((child) => {
            if (child.is_dir) return buildNode(child.path);

            const childConfig = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(child.path);
            return {
              path: child.path,
              name: child.name,
              is_dir: false,
              icon: childConfig?.icon || null,
              color: childConfig?.color || null,
              size: 0,
              size_human: '',
              children: [],
              metadata: {
                title: child.title || null,
                date: child.date_created || null,
                category: child.category || null,
                tags: JSON.parse(child.tags || '[]'),
              },
            };
          }),
          metadata: null,
        };
      }

      res.json(buildNode('notes'));
    } catch (error) {
      console.error('/api/tree error:', error);
      res.status(500).json({ detail: error.message });
    }
  });
}
