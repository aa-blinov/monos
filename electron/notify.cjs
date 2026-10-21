// A background event the person cannot see from the window.
//
// While the app is in front, the window says everything: the row in the sidebar shows the sync
// state, the overlay shows a conflict. When the app is in the background, the system says it in
// the system's own way. The decision "the person is looking at the app, so stay quiet" belongs to
// the shell, which is the only place that knows whether a window has the focus.

/**
 * What the system should say, or null when it should stay quiet.
 *
 * Quiet when the app is in front (the person sees it in the window), when the system has no
 * notifications, and when there is nothing to say.
 */
function backgroundNotice(payload, { focused = false, supported = true } = {}) {
  if (focused || !supported) return null;
  const title = String(payload?.title || '').trim();
  if (!title) return null;
  return { title, body: String(payload?.body || '').trim() };
}

module.exports = { backgroundNotice };
