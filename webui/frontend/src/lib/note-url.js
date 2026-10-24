import { normalizeNotePath } from './app-shell.js';

// A note name is free text: "C# notes", "100% done", "what? yes" are all valid file names, and
// "#" or "?" in an unencoded address cut the path short. Every segment is encoded on its own,
// so the slashes between folders stay slashes.
export function noteRoute(filePath) {
  const clean = normalizeNotePath(String(filePath ?? ''));
  return `/notes/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

// A broken percent sequence ("/notes/100%%20done.md" typed or pasted by hand) would make the router
// throw "URI malformed" before the page draws; a lone "%" is read as the literal character.
export function repairPercentEncoding(pathname) {
  return String(pathname ?? '').replace(/%(?![0-9a-fA-F]{2})/g, '%25');
}

// Never throws: the router has already decoded the address once, so a second decode would turn the
// file "a%2Fb" into "a/b". Only a still-encoded value (a caller outside the router) is decoded here.
export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
