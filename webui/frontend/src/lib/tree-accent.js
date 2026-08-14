/**
 * Compute a CSS style string for a tree item, applying the node's color
 * to the left border and the text label so notes are tinted in the tree
 * the same way they are on the dashboard.
 *
 * @param {object} args
 * @param {string|null|undefined} args.color - node color (e.g. '#8ec07c') or null
 * @param {string} [args.fallback] - CSS color used when no color is set
 * @returns {string} inline CSS for the left border and the text
 */
export function getTreeItemAccentStyle({ color, fallback = 'transparent' } = {}) {
  const accent = color && typeof color === 'string' ? color : fallback;
  // Use a low-alpha version of the accent to tint the text without overpowering
  // the row. Empty string when there's no color so the text stays default.
  const textTint = color && typeof color === 'string' ? color : '';
  return `--tree-accent: ${accent}; --tree-text: ${textTint};`;
}
