import { announceNotesPulled } from './note-refresh.js';

/**
 * Changes made to the notes folder outside Monos — an agent in the terminal, another editor — come from the
 * backend as server-sent events (GET /api/events). The open note reads its file again (as after a sync), and
 * `onFiles` lets the app refresh the board and the tree. The browser reconnects a dropped stream on its own.
 *
 * @param {{ onFiles?: (paths: string[]) => void, EventSourceImpl?: typeof EventSource }} options
 * @returns {() => void} closes the stream
 */
export function listenForNoteChanges({ onFiles = () => {}, EventSourceImpl = globalThis.EventSource } = {}) {
  if (typeof EventSourceImpl !== 'function') return () => {};
  const source = new EventSourceImpl('/api/events');
  source.onmessage = (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event?.type !== 'files' || !Array.isArray(event.paths)) return;
    announceNotesPulled();
    onFiles(event.paths);
  };
  return () => source.close();
}
