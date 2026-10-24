import path from 'path';

// What a note's text says about files: used to tell a picture in use from an unused one, and to bring a note's
// pictures back from the trash with it.

/** Files below `noteDir` that the text links to by path: `![](…)` and `[name](…)`, a PDF is linked, not embedded. */
export function referencedPaths(noteDir, markdown) {
  const found = new Set();
  for (const match of String(markdown || '').matchAll(/\]\(([^)\s]+)/g)) {
    let target = match[1].trim();
    if (/^(https?:|data:)/i.test(target)) continue;
    try {
      target = decodeURI(target);
    } catch {
      // A malformed escape is still a path we can try as-is.
    }
    const full = path.resolve(noteDir, target);
    if (!full.startsWith(path.resolve(noteDir) + path.sep)) continue;
    found.add(path.resolve(full));
  }
  return found;
}

function fileNameOf(target) {
  let name = String(target).trim();
  try {
    name = decodeURI(name);
  } catch {
    // A malformed escape is still a name we can try as written.
  }
  return name.split('/').pop();
}

// Obsidian and the editor name a file rather than a path: `![[pic.png]]` and `[[report.pdf|the report]]`
// mean a file of that name wherever it sits in the notes, and an HTML <img src> may carry a path. A file
// whose name is written anywhere counts as in use.
export function namedReferences(markdown) {
  const names = new Set();
  const text = String(markdown || '');
  for (const match of text.matchAll(/\[\[([^\]|#\n]+)/g)) names.add(fileNameOf(match[1]));
  for (const match of text.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) names.add(fileNameOf(match[1]));
  return names;
}
