// The window keeps its place.
//
// A desktop app opens where it was left: the same size, on the same screen. Monos opened at a
// fixed size in the middle of the screen every time, so a person who had put it aside had to
// put it back again on every launch.
//
// The state lives in the app's own folder, not among the notes: the notes are the person's, and
// this is the app's.

const fs = require('node:fs');
const path = require('node:path');

const FILE = 'window-state.json';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 640;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 840;

function windowStatePath(userDataDir) {
  return path.join(userDataDir, FILE);
}

/**
 * The saved window, or null when there is nothing to restore.
 * A broken file is ignored rather than fatal: the window opens with the usual size.
 */
function readWindowState(userDataDir) {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(userDataDir), 'utf8'));
    if (!Number.isFinite(state.width) || !Number.isFinite(state.height)) return null;
    if (state.width < MIN_WIDTH || state.height < MIN_HEIGHT) return null;
    const restored = { width: Math.round(state.width), height: Math.round(state.height) };
    if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
      restored.x = Math.round(state.x);
      restored.y = Math.round(state.y);
    }
    return restored;
  } catch {
    return null;
  }
}

/** Remember the window. A failure here is not worth breaking the app over. */
function writeWindowState(userDataDir, bounds) {
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return;
  try {
    fs.writeFileSync(windowStatePath(userDataDir), JSON.stringify({
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      x: Math.round(bounds.x || 0),
      y: Math.round(bounds.y || 0),
    }));
  } catch {
    // A folder that cannot be written to only means the window is not remembered.
  }
}

/**
 * True when the window would be visible on one of the screens: a monitor that is gone must not
 * leave the window outside of the desktop, where nothing can reach it.
 */
function boundsOnScreen(bounds, displays) {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false;
  return (displays || []).some((display) => {
    const area = display.workArea || display;
    return bounds.x < area.x + area.width
      && bounds.x + bounds.width > area.x
      && bounds.y < area.y + area.height
      && bounds.y + bounds.height > area.y;
  });
}

module.exports = {
  FILE, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  readWindowState, writeWindowState, boundsOnScreen,
};
