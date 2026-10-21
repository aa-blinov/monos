/**
 * Reminders for notes that carry a `due` date in their frontmatter.
 *
 * Scope is deliberately the note the person is looking at. A background sweep
 * over every note would need the due date in the search index and a scheduler
 * that survives a reload; promising that without it would mean reminders that
 * silently never fire. What this does promise is honest: while a note is open,
 * the header says whether it is overdue, due today or still ahead, and the
 * browser can raise a notification once per due date.
 */

const SHOWN_KEY = 'monos.due.notified';

/** Due dates already announced in this browser, so a reload stays quiet. */
function notifiedSet() {
  try {
    return new Set(JSON.parse(globalThis.localStorage?.getItem(SHOWN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function rememberNotified(path, due) {
  const shown = notifiedSet();
  shown.add(`${path}@${due}`);
  try {
    // Ограничиваем размер, иначе список растёт бесконечно.
    const trimmed = [...shown].slice(-200);
    globalThis.localStorage?.setItem(SHOWN_KEY, JSON.stringify(trimmed));
  } catch {
    // Приватный режим браузера — просто не запоминаем.
  }
}

/** Has this browser already announced this exact note/date pair? */
export function wasNotified(path, due) {
  return notifiedSet().has(`${path}@${due}`);
}

export function canNotify() {
  return typeof globalThis.Notification === 'function'
    && globalThis.Notification.permission === 'granted';
}

export async function requestNotifyPermission() {
  if (typeof globalThis.Notification !== 'function') return 'unsupported';
  if (globalThis.Notification.permission !== 'default') return globalThis.Notification.permission;
  try {
    return await globalThis.Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Announce a note once per due date.
 *
 * @param {{path: string, name: string, due: string, status: string}} note
 * @param {{title: string, body: string}} message
 * @returns {boolean} whether a notification was actually shown
 */
export function notifyDue(note, message) {
  if (!note?.path || !note.due) return false;
  if (!canNotify()) return false;
  if (wasNotified(note.path, note.due)) return false;
  // Telling someone about a note that is not due yet is noise, not a reminder.
  if (note.status !== 'overdue' && note.status !== 'today') return false;

  try {
    new globalThis.Notification(message.title, { body: message.body, tag: `monos-due-${note.path}` });
  } catch {
    return false;
  }
  rememberNotified(note.path, note.due);
  return true;
}

export function resetNotified() {
  try {
    globalThis.localStorage?.removeItem(SHOWN_KEY);
  } catch {
    // Ничего страшного.
  }
}
