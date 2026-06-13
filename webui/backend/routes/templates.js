import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from '../config.js';
import { nowISO } from '../utils.js';

const TEMPLATE_SETTINGS_DIR = path.join(NOTES_DIR, '.monos');
const TEMPLATE_SETTINGS_PATH = path.join(TEMPLATE_SETTINGS_DIR, 'templates.json');

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
}

function normalizeCustomTemplate(template = {}) {
  const now = nowISO();
  return {
    id: String(template.id || `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`),
    title: String(template.title || '').trim(),
    description: String(template.description || '').trim(),
    category: String(template.category || '').trim(),
    tags: normalizeTags(template.tags),
    content: String(template.content || '').trimEnd(),
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
  };
}

function emptyTemplateSettings() {
  return {
    customTemplates: [],
    hiddenLibraryTemplateIds: [],
  };
}

function readTemplateSettings() {
  if (!fs.existsSync(TEMPLATE_SETTINGS_PATH)) return emptyTemplateSettings();
  const parsed = JSON.parse(fs.readFileSync(TEMPLATE_SETTINGS_PATH, 'utf-8'));
  return {
    customTemplates: Array.isArray(parsed.customTemplates)
      ? parsed.customTemplates.map(normalizeCustomTemplate).filter((template) => template.title)
      : [],
    hiddenLibraryTemplateIds: Array.isArray(parsed.hiddenLibraryTemplateIds)
      ? [...new Set(parsed.hiddenLibraryTemplateIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
  };
}

function writeTemplateSettings(settings) {
  fs.mkdirSync(TEMPLATE_SETTINGS_DIR, { recursive: true });
  const normalized = {
    customTemplates: Array.isArray(settings.customTemplates)
      ? settings.customTemplates.map(normalizeCustomTemplate).filter((template) => template.title)
      : [],
    hiddenLibraryTemplateIds: Array.isArray(settings.hiddenLibraryTemplateIds)
      ? [...new Set(settings.hiddenLibraryTemplateIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
  };
  const tempPath = `${TEMPLATE_SETTINGS_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, TEMPLATE_SETTINGS_PATH);
  return normalized;
}

export function registerTemplateRoutes(app) {
  app.get('/api/templates', (req, res) => {
    try {
      res.json(readTemplateSettings());
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.put('/api/templates', (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ detail: 'Request body must be an object' });
      }
      res.json(writeTemplateSettings(req.body));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
