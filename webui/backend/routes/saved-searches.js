import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from '../config.js';
import { nowISO } from '../utils.js';

/**
 * Saved searches.
 *
 * They live in `notes/.monos/`, the same place templates do, because that folder
 * travels with the notes: a search saved on one machine is there on the next
 * one, and it shows up in git. Storing them in the browser would repeat the
 * mistake the pinned notes used to make.
 *
 * A search is a name plus a query string in the same dialect the search box
 * already speaks — including `body:` and `updated:`. Nothing here re-parses it;
 * `/api/search` is the only place that has to understand the syntax, so a
 * saved search can never drift away from what typing it by hand would do.
 */

const SETTINGS_DIR_NAME = '.monos';
const SAVED_SEARCHES_NAME = 'saved-searches.json';

/** A search long enough to be a search, short enough to stay legible. */
const MAX_QUERY_LENGTH = 500;

function settingsPath(baseDir) {
  return path.join(baseDir, SETTINGS_DIR_NAME, SAVED_SEARCHES_NAME);
}

function normalizeSearch(search, index) {
  const query = String(search?.query || '').trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return null;
  const name = String(search?.name || '').trim().slice(0, 80) || query.slice(0, 40);
  return {
    id: String(search?.id || `saved-${Date.now()}-${index}`),
    name,
    query,
    createdAt: String(search?.createdAt || nowISO()),
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((search, index) => normalizeSearch(search, index))
    .filter(Boolean);
}

// Каталог передаётся параметром, чтобы тесты работали в своей папке и не
// подменяли NOTES_DIR в конфиге.
export function readSavedSearches(baseDir = NOTES_DIR) {
  const filePath = settingsPath(baseDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Поддержать оба вида: голый массив и объект со списком.
    return normalizeList(Array.isArray(parsed) ? parsed : parsed?.searches);
  } catch {
    // Битый файл не должен ронять приложение: человек потеряет список
    // сохранённых поисков, но не сможет открыть заметки.
    return [];
  }
}

export function writeSavedSearches(value, baseDir = NOTES_DIR) {
  const filePath = settingsPath(baseDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = normalizeList(Array.isArray(value) ? value : value?.searches);
  // Запись через временный файл: обрыв на середине не оставил бы половину списка.
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, filePath);
  return normalized;
}

export function registerSavedSearchRoutes(app) {
  app.get('/api/saved-searches', (req, res) => {
    try {
      res.json(readSavedSearches());
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.put('/api/saved-searches', (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ detail: 'Request body must be an object' });
      }
      res.json(writeSavedSearches(req.body));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
