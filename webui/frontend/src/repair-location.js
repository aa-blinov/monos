// Imported first in main.js: svelte-routing reads the address when its module loads, and it throws
// "URI malformed" on a broken percent sequence, so the address has to be mended before that.
import { repairPercentEncoding } from './lib/note-url.js';

const repaired = repairPercentEncoding(window.location.pathname);
if (repaired !== window.location.pathname) {
  window.history.replaceState({}, '', repaired + window.location.search + window.location.hash);
}
