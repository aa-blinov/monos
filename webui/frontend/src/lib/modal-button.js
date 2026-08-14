/**
 * Shared class string for modal footer buttons (Cancel / Save / Create / Delete).
 * Both variants use the same size, case, and tracking so they line up visually
 * on the same flex row; the primary variant is bolder/brighter, the secondary
 * variant is muted via the secondary text color.
 *
 * @param {'primary'|'secondary'} variant
 * @param {{disabled?: boolean, extraClass?: string}} [opts]
 * @returns {string} Tailwind class string
 */
export function getModalButtonClass(variant, opts = {}) {
  const { disabled = false, extraClass = '' } = opts;
  const base = 'flex-1 text-sm uppercase tracking-widest transition disabled:opacity-30 disabled:cursor-not-allowed';
  let out;
  if (variant === 'primary') {
    out = `${base} font-bold text-[var(--text-primary)] hover:opacity-70`;
  } else {
    out = `${base} font-normal text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:opacity-100`;
  }
  if (extraClass) out = `${out} ${extraClass}`;
  return out.trim();
}
