import { writable } from 'svelte/store';
import { buildTemplateContent as buildLibraryTemplateContent, getLocalizedTemplates, getTemplateContext } from './note-templates.js';

const HIDDEN_LIBRARY_TEMPLATES_KEY = 'hiddenLibraryTemplateIds';
const CUSTOM_TEMPLATES_KEY = 'customNoteTemplates';
const TEMPLATE_SETTINGS_MIGRATED_KEY = 'templateSettingsDiskMigrated';

let templateSettingsLoaded = false;
let templateSettingsLoading = null;
let suppressSave = false;

function readJson(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function uniqueId() {
  return `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 10000)}`}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
}

function normalizeCustomTemplate(template = {}) {
  const title = String(template.title || '').trim();
  return {
    id: template.id || uniqueId(),
    title,
    description: String(template.description || '').trim(),
    category: String(template.category || '').trim(),
    tags: normalizeTags(template.tags),
    content: String(template.content || '').trimEnd(),
    createdAt: template.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function renderCustomTemplateContent(source, ctx) {
  return String(source || '')
    .replaceAll('{{title}}', ctx.title)
    .replaceAll('{{date}}', ctx.isoDate)
    .replaceAll('{{shortDate}}', ctx.shortDate)
    .replaceAll('{{time}}', ctx.time);
}

export const hiddenLibraryTemplateIds = writable(new Set(readJson(HIDDEN_LIBRARY_TEMPLATES_KEY, [])));
export const customNoteTemplates = writable(readJson(CUSTOM_TEMPLATES_KEY, []).map(normalizeCustomTemplate));
export const templateSettingsReady = writable(false);

function snapshotStores() {
  let customTemplates = [];
  let hiddenIds = new Set();
  customNoteTemplates.subscribe((value) => { customTemplates = value; })();
  hiddenLibraryTemplateIds.subscribe((value) => { hiddenIds = value; })();
  return {
    customTemplates: customTemplates.map(normalizeCustomTemplate),
    hiddenLibraryTemplateIds: [...hiddenIds],
  };
}

async function saveTemplateSettings({ force = false } = {}) {
  if ((!templateSettingsLoaded && !force) || suppressSave) return;
  const snapshot = snapshotStores();
  await fetchJson('/api/templates', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  writeJson(CUSTOM_TEMPLATES_KEY, snapshot.customTemplates);
  writeJson(HIDDEN_LIBRARY_TEMPLATES_KEY, snapshot.hiddenLibraryTemplateIds);
}

hiddenLibraryTemplateIds.subscribe((ids) => {
  writeJson(HIDDEN_LIBRARY_TEMPLATES_KEY, [...ids]);
  void saveTemplateSettings().catch(() => {});
});

customNoteTemplates.subscribe((templates) => {
  writeJson(CUSTOM_TEMPLATES_KEY, templates.map(normalizeCustomTemplate));
  void saveTemplateSettings().catch(() => {});
});

export async function loadTemplateSettings() {
  if (templateSettingsLoading) return templateSettingsLoading;
  templateSettingsLoading = (async () => {
    try {
      const diskSettings = await fetchJson('/api/templates');
      const localCustomTemplates = readJson(CUSTOM_TEMPLATES_KEY, []).map(normalizeCustomTemplate).filter((template) => template.title);
      const localHiddenIds = readJson(HIDDEN_LIBRARY_TEMPLATES_KEY, []);
      const shouldMigrateLocal = typeof localStorage !== 'undefined'
        && localStorage.getItem(TEMPLATE_SETTINGS_MIGRATED_KEY) !== 'true'
        && (localCustomTemplates.length > 0 || localHiddenIds.length > 0)
        && (!Array.isArray(diskSettings.customTemplates) || diskSettings.customTemplates.length === 0)
        && (!Array.isArray(diskSettings.hiddenLibraryTemplateIds) || diskSettings.hiddenLibraryTemplateIds.length === 0);

      const nextCustomTemplates = shouldMigrateLocal
        ? localCustomTemplates
        : (Array.isArray(diskSettings.customTemplates) ? diskSettings.customTemplates : []).map(normalizeCustomTemplate).filter((template) => template.title);
      const nextHiddenIds = shouldMigrateLocal
        ? localHiddenIds
        : (Array.isArray(diskSettings.hiddenLibraryTemplateIds) ? diskSettings.hiddenLibraryTemplateIds : []);

      suppressSave = true;
      customNoteTemplates.set(nextCustomTemplates);
      hiddenLibraryTemplateIds.set(new Set(nextHiddenIds));
      suppressSave = false;
      templateSettingsLoaded = true;
      templateSettingsReady.set(true);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TEMPLATE_SETTINGS_MIGRATED_KEY, 'true');
      }
      if (shouldMigrateLocal) await saveTemplateSettings();
    } catch {
      templateSettingsLoaded = true;
      templateSettingsReady.set(true);
    } finally {
      suppressSave = false;
      templateSettingsLoading = null;
    }
  })();
  return templateSettingsLoading;
}

export function customTemplateToRuntime(template) {
  const normalized = normalizeCustomTemplate(template);
  return {
    ...normalized,
    source: 'custom',
    approach: 'custom',
    approachTitle: 'Custom',
    approachDescription: 'Templates you created.',
    suggestedTitle: ({ date }) => normalized.title || `Note ${date.toISOString().slice(0, 10)}`,
    content: (ctx) => renderCustomTemplateContent(normalized.content || `# ${ctx.title}\n`, ctx),
  };
}

export function getTemplateCatalog(currentLocale = 'en', hiddenIds = new Set(), customTemplates = []) {
  const hiddenSet = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || []);
  const libraryTemplates = getLocalizedTemplates(currentLocale)
    .map((template) => ({ ...template, source: 'library' }))
    .filter((template) => !hiddenSet.has(template.id));
  const customRuntimeTemplates = customTemplates.map(customTemplateToRuntime);
  return [...customRuntimeTemplates, ...libraryTemplates];
}

export function getTemplateCatalogById(id, currentLocale = 'en', hiddenIds = new Set(), customTemplates = []) {
  const templates = getTemplateCatalog(currentLocale, hiddenIds, customTemplates);
  return templates.find((template) => template.id === id) || templates[0] || null;
}

export function getLibraryTemplatesForManagement(currentLocale = 'en', hiddenIds = new Set()) {
  const hiddenSet = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || []);
  return getLocalizedTemplates(currentLocale).map((template) => ({
    ...template,
    source: 'library',
    hidden: hiddenSet.has(template.id),
  }));
}

export async function hideLibraryTemplate(templateId) {
  hiddenLibraryTemplateIds.update((ids) => new Set([...ids, templateId]));
  await saveTemplateSettings({ force: true });
}

export async function showLibraryTemplate(templateId) {
  hiddenLibraryTemplateIds.update((ids) => {
    const next = new Set(ids);
    next.delete(templateId);
    return next;
  });
  await saveTemplateSettings({ force: true });
}

export async function saveCustomTemplate(template) {
  const normalized = normalizeCustomTemplate(template);
  if (!normalized.title) return null;
  customNoteTemplates.update((templates) => {
    const exists = templates.some((item) => item.id === normalized.id);
    return exists
      ? templates.map((item) => item.id === normalized.id ? { ...normalized, createdAt: item.createdAt } : item)
      : [normalized, ...templates];
  });
  await saveTemplateSettings({ force: true });
  return normalized;
}

export async function deleteCustomTemplate(templateId) {
  customNoteTemplates.update((templates) => templates.filter((template) => template.id !== templateId));
  await saveTemplateSettings({ force: true });
}

export function buildRuntimeTemplateContent(template, title, date = new Date()) {
  if (template?.source === 'custom') {
    return template.content(getTemplateContext(title, date)).trimStart();
  }
  return buildLibraryTemplateContent(template, title, date);
}
