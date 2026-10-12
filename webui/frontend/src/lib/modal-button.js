/**
 * Shared class string for modal buttons (Cancel / Save / Create / Delete).
 * Both variants use the same size, case, and tracking so they line up visually
 * on the same flex row; the primary variant is bolder/brighter, the secondary
 * variant is muted via the secondary text color.
 *
 * The buttons stretch by default because the usual home is a modal footer
 * where two of them split the row. Anywhere else — next to a value, in a
 * toolbar — stretching makes the label drift to the centre of a wide block,
 * so pass `fit: false` to take the button's own width instead.
 *
 * @param {'primary'|'secondary'} variant
 * @param {{disabled?: boolean, extraClass?: string, fit?: boolean}} [opts]
 * @returns {string} Tailwind class string
 */
export function getModalButtonClass(variant, opts = {}) {
  const { disabled = false, extraClass = '', fit = true } = opts;
  const width = fit ? 'flex-1' : '!flex-none shrink-0 whitespace-nowrap';
  const base = `${width} text-sm uppercase tracking-widest transition disabled:opacity-30 disabled:cursor-not-allowed`;
  let out;
  if (variant === 'primary') {
    out = `${base} font-bold text-[var(--text-primary)] hover:opacity-70`;
  } else {
    out = `${base} font-normal text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:opacity-100`;
  }
  if (extraClass) out = `${out} ${extraClass}`;
  return out.trim();
}
