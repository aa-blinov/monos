/**
 * Compute adjusted (x, y) for a context menu so it stays inside the viewport.
 *
 * If the menu would overflow the right or bottom edge of the viewport it is
 * flipped to open up-and-to-the-left from the cursor so the whole menu is
 * visible. The cursor position is clamped within `margin` of the viewport
 * edges so the menu never sits flush against the screen border.
 *
 * @param {object} args
 * @param {number} args.x - desired menu left (e.g. mouse clientX)
 * @param {number} args.y - desired menu top (e.g. mouse clientY)
 * @param {number} args.menuWidth - measured menu width in px
 * @param {number} args.menuHeight - measured menu height in px
 * @param {number} args.viewportWidth
 * @param {number} args.viewportHeight
 * @param {number} [args.margin=4] - min space between menu and viewport edge
 * @returns {{ x: number, y: number, flippedX: boolean, flippedY: boolean }}
 */
export function computeContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 4,
}) {
  const safeWidth = Math.max(0, Number(menuWidth) || 0);
  const safeHeight = Math.max(0, Number(menuHeight) || 0);
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const vh = Math.max(0, Number(viewportHeight) || 0);
  const m = Math.max(0, Number(margin) || 0);

  // Decide whether to flip. Flip when the menu would overflow the edge AND
  // there is enough room on the opposite side to fit it. We always honour
  // the cursor side when the flipped side cannot fit either.
  const overflowsRight = x + safeWidth + m > vw;
  const overflowsBottom = y + safeHeight + m > vh;
  const flipX = overflowsRight && safeWidth <= x;
  const flipY = overflowsBottom && safeHeight <= y;

  const nextX = flipX ? Math.max(m, x - safeWidth) : Math.max(m, x);
  const nextY = flipY ? Math.max(m, y - safeHeight) : Math.max(m, y);

  return { x: nextX, y: nextY, flippedX: flipX, flippedY: flipY };
}
