/**
 * One tooltip for the whole app. TooltipIconButton draws its own from the same look and placement; every other
 * element gets it from a `title` (or `data-tooltip`) through one listener on the document, so the browser's
 * grey system tooltip never shows and every hint looks, waits and sits the same way.
 *
 * - A short label ("Trash") reads as a small capital tag; a sentence wraps in ordinary case.
 * - Hover waits HOVER_DELAY so a pointer passing over does not set one off; keyboard focus shows it at once.
 * - Below 640px (a phone) there are no tooltips: there is no hover there.
 * - `data-tooltip-position="right"` puts it beside the element (the tree); `data-tooltip-overflow` shows it only
 *   while the element's `.truncate` text is cut off.
 */

export const HOVER_DELAY = 450;
export const TOOLTIP_GAP = 8;
export const VIEWPORT_MARGIN = 12;
const SENTENCE_LENGTH = 32;

const BASE_CLASS = 'pointer-events-none fixed z-[120] rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)] shadow-lg shadow-black/10';

/** The tooltip's classes for this text: a capital tag for a label, wrapped ordinary text for a sentence. */
export function tooltipClass(text) {
  const sentence = String(text || '').length > SENTENCE_LENGTH;
  return `${BASE_CLASS} ${sentence
    ? 'w-max max-w-xs whitespace-normal text-xs font-normal normal-case tracking-normal leading-relaxed'
    : 'whitespace-nowrap text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.14em]'}`;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Where the tooltip goes: below the anchor (or above, or to the right), moved to the other side when there is
 * no room, and kept inside the window.
 * @returns {{ left: number, top: number }}
 */
export function placeTooltip(anchor, tip, viewport, { position = 'bottom', align = 'center' } = {}) {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - tip.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - tip.height - VIEWPORT_MARGIN);

  if (position === 'right') {
    let left = anchor.right + TOOLTIP_GAP;
    if (left > maxLeft) left = anchor.left - tip.width - TOOLTIP_GAP;
    const top = anchor.top + anchor.height / 2 - tip.height / 2;
    return { left: Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft)), top: Math.round(clamp(top, VIEWPORT_MARGIN, maxTop)) };
  }

  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  if (align === 'start') left = anchor.left;
  if (align === 'end') left = anchor.right - tip.width;

  let top = position === 'top' ? anchor.top - tip.height - TOOLTIP_GAP : anchor.bottom + TOOLTIP_GAP;
  if (top < VIEWPORT_MARGIN) top = anchor.bottom + TOOLTIP_GAP;
  if (top > maxTop) top = anchor.top - tip.height - TOOLTIP_GAP;

  return { left: Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft)), top: Math.round(clamp(top, VIEWPORT_MARGIN, maxTop)) };
}

/** The element under the pointer that carries a hint, and the hint. A `title` moves aside while it is shown. */
export function hintOf(target) {
  const element = target?.closest?.('[title], [data-tooltip], [data-monos-title]');
  if (!element) return null;
  const text = element.getAttribute('data-tooltip') || element.getAttribute('title') || element.getAttribute('data-monos-title') || '';
  return text.trim() ? { element, text: text.trim() } : null;
}

function isCutOff(element) {
  const text = element.querySelector('.truncate') || element;
  return text.scrollWidth > text.clientWidth + 1;
}

/** Starts the shared tooltips on a document; returns a function that stops them. */
export function installTooltips(doc = document) {
  const win = doc.defaultView;
  let current = null;
  let tipEl = null;
  let timer = null;
  // After a click the hint stays away until the pointer leaves that element.
  let dismissed = null;

  function stashTitle(element) {
    const title = element.getAttribute('title');
    if (title === null) return;
    element.setAttribute('data-monos-title', title);
    element.removeAttribute('title');
  }

  function restoreTitle(element) {
    const title = element.getAttribute('data-monos-title');
    if (title === null) return;
    // The page may have set a new title meanwhile; that one wins.
    if (!element.hasAttribute('title')) element.setAttribute('title', title);
    element.removeAttribute('data-monos-title');
  }

  function hide() {
    clearTimeout(timer);
    timer = null;
    tipEl?.remove();
    tipEl = null;
    if (current) restoreTitle(current);
    current = null;
  }

  function show() {
    if (!current || !current.isConnected) return hide();
    if (current.hasAttribute('data-tooltip-overflow') && !isCutOff(current)) return;
    const text = current.getAttribute('data-tooltip') || current.getAttribute('data-monos-title') || '';
    if (!text.trim()) return;
    tipEl = doc.createElement('span');
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('data-testid', 'app-tooltip');
    tipEl.className = tooltipClass(text);
    tipEl.textContent = text.trim();
    doc.body.appendChild(tipEl);
    const { left, top } = placeTooltip(current.getBoundingClientRect(), tipEl.getBoundingClientRect(), { width: win.innerWidth, height: win.innerHeight }, {
      position: current.getAttribute('data-tooltip-position') || 'bottom',
    });
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  }

  function start(target, immediately) {
    if (win.innerWidth < 640) return;
    const hint = hintOf(target);
    if (!hint) return hide();
    if (hint.element === current || hint.element === dismissed) return;
    hide();
    current = hint.element;
    stashTitle(current);
    if (immediately) show();
    else timer = setTimeout(show, HOVER_DELAY);
  }

  const onOver = (event) => start(event.target, false);
  const onOut = (event) => {
    if (dismissed && !dismissed.contains(event.relatedTarget)) dismissed = null;
    if (current && !current.contains(event.relatedTarget)) hide();
  };
  const onPress = () => {
    dismissed = current;
    hide();
  };
  const onFocus = (event) => {
    if (event.target?.matches?.(':focus-visible')) start(event.target, true);
  };
  const onBlur = () => hide();

  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('mouseout', onOut);
  doc.addEventListener('focusin', onFocus);
  doc.addEventListener('focusout', onBlur);
  doc.addEventListener('pointerdown', onPress, true);
  doc.addEventListener('keydown', hide, true);
  win.addEventListener('scroll', hide, true);
  win.addEventListener('blur', hide);

  return () => {
    hide();
    doc.removeEventListener('mouseover', onOver);
    doc.removeEventListener('mouseout', onOut);
    doc.removeEventListener('focusin', onFocus);
    doc.removeEventListener('focusout', onBlur);
    doc.removeEventListener('pointerdown', onPress, true);
    doc.removeEventListener('keydown', hide, true);
    win.removeEventListener('scroll', hide, true);
    win.removeEventListener('blur', hide);
  };
}
