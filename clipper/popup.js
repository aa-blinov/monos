const $ = (id) => document.getElementById(id);
const DEFAULTS = { endpoint: 'http://127.0.0.1:8000', token: '', folder: 'clips', includeSelection: true };

async function loadSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  $('endpoint').value = stored.endpoint || DEFAULTS.endpoint;
  $('token').value = stored.token || '';
  $('folder').value = stored.folder || DEFAULTS.folder;
  $('includeSelection').checked = stored.includeSelection !== false;
}

async function saveSettings() {
  await chrome.storage.local.set({
    endpoint: $('endpoint').value.trim(),
    token: $('token').value.trim(),
    folder: $('folder').value.trim(),
    includeSelection: $('includeSelection').checked,
  });
}

function setStatus(message, tone = '') {
  const el = $('status');
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

/** Readable text from the page, minus chrome the reader never sees. */
function extractReadableText() {
  const clone = document.body.cloneNode(true);
  for (const node of clone.querySelectorAll('script,style,nav,footer,aside,header,noscript,form,iframe')) {
    node.remove();
  }
  const root = clone.querySelector('article, main, [role="main"]') || clone;
  return (root.innerText || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

async function clip(scope) {
  setStatus('Clipping…');
  await saveSettings();

  const endpoint = $('endpoint').value.trim().replace(/\/$/, '');
  const token = $('token').value.trim();
  if (!endpoint || !token) {
    setStatus('Fill in the app address and token first.', 'error');
    return;
  }

  const selection = String(window.getSelection?.() || '').trim();
  const wantSelection = $('includeSelection').checked && scope === 'selection';

  const payload = {
    title: $('title').value.trim() || document.title,
    folder: $('folder').value.trim(),
    sourceUrl: window.location.href,
    selectedText: wantSelection && selection ? [selection] : [],
    content: wantSelection ? '' : extractReadableText(),
  };

  try {
    const response = await fetch(`${endpoint}/api/clip/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Monos-Clip-Token': token },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    setStatus(`Saved: ${data.path}`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Could not reach Monos', 'error');
  }
}

$('clipPage').addEventListener('click', () => clip('page'));
$('clipSelection').addEventListener('click', () => clip('selection'));
loadSettings();