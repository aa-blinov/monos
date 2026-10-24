import path from 'path';
import { NOTES_DIR } from '../config.js';
import { getDb } from '../database.js';
import { sendError } from './helpers.js';

export function registerTreeRoutes(app) {
  /**
   * Where the notes actually live.
   *
   * The whole promise of the app is that the notes are ordinary files on the
   * user's disk, so the folder is shown in the interface rather than hidden
   * behind a menu. This is the user's own path on their own machine.
   */
  app.get('/api/info', (req, res) => {
    res.json({ notesDir: NOTES_DIR });
  });

  app.get('/api/tree', (req, res) => {
    try {
      const db = getDb();

      // One pass over the index: only the columns the tree shows (never the note text), every folder's settings
      // read once, children grouped by their folder. Asking the database per folder and per note, with the whole
      // row, was a quarter of a second on a few thousand notes.
      const rows = db.prepare(`
        SELECT path, name, is_dir, parent_path, title, date_created, category, tags, pinned
        FROM notes_index
        WHERE trashed_at IS NULL OR trashed_at = ''
        ORDER BY is_dir DESC, name COLLATE NOCASE ASC
      `).all();
      const configs = new Map(db.prepare('SELECT path, icon, color FROM folder_config').all().map((row) => [row.path, row]));
      const childrenOf = new Map();
      for (const row of rows) {
        const siblings = childrenOf.get(row.parent_path);
        if (siblings) siblings.push(row);
        else childrenOf.set(row.parent_path, [row]);
      }

      function buildNode(relativePath) {
        const name = relativePath === 'notes' ? 'notes' : path.basename(relativePath);
        const folderConfig = configs.get(relativePath);

        return {
          path: relativePath,
          name,
          is_dir: true,
          icon: folderConfig?.icon || null,
          color: folderConfig?.color || null,
          size: 0,
          size_human: '',
          children: (childrenOf.get(relativePath) || []).map((child) => {
            if (child.is_dir) return buildNode(child.path);

            const childConfig = configs.get(child.path);
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
                pinned: Boolean(child.pinned),
              },
            };
          }),
          metadata: null,
        };
      }

      res.json(buildNode('notes'));
    } catch (error) {
      console.error('/api/tree error:', error);
      sendError(res, error);
    }
  });
}
