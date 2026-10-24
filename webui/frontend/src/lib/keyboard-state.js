// The on-screen keyboard does not resize the page on every phone: some shrink only the visual viewport. The page
// marks the root with `data-keyboard` while one is up, and the `short` variant (tailwind.config.js) treats that
// like a short screen, so the text keeps its room while the person types.

const KEYBOARD_MIN_HEIGHT = 120;
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** The keyboard is up when a field has the focus and the visible area lost a keyboard's worth of height. */
export function keyboardIsUp({ layoutHeight, visibleHeight, editableFocused }) {
  return Boolean(editableFocused) && layoutHeight - visibleHeight >= KEYBOARD_MIN_HEIGHT;
}

export function watchKeyboard(win, doc) {
  const viewport = win.visualViewport;
  if (!viewport) return () => {};
  const update = () => {
    const active = doc.activeElement;
    const up = keyboardIsUp({
      layoutHeight: win.innerHeight,
      visibleHeight: viewport.height,
      editableFocused: Boolean(active?.matches?.(EDITABLE)),
    });
    if (up) doc.documentElement.setAttribute('data-keyboard', '');
    else doc.documentElement.removeAttribute('data-keyboard');
  };
  viewport.addEventListener('resize', update);
  doc.addEventListener('focusin', update);
  doc.addEventListener('focusout', update);
  return () => {
    viewport.removeEventListener('resize', update);
    doc.removeEventListener('focusin', update);
    doc.removeEventListener('focusout', update);
    doc.documentElement.removeAttribute('data-keyboard');
  };
}
