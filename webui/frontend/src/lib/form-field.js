/**
 * Shared class string for underline-style form fields (title inputs, folder
 * selects, etc.) so that `<input>` and `<select>` render text on the same
 * baseline. Without an explicit `text-sm` + `leading-6` + `py-1.5` the native
 * select uses its own font-size/line-height and the two fields visibly
 * misalign.
 *
 * @param {{extraClass?: string}} [opts]
 * @returns {string} Tailwind class string
 */
export function formFieldClass(opts = {}) {
  const { extraClass = '' } = opts;
  const base = 'w-full bg-transparent border-b border-[var(--border-subtle)] py-1.5 text-sm leading-6 outline-none transition focus:border-[var(--text-secondary)]';
  let out = base;
  if (extraClass) out = `${out} ${extraClass}`;
  return out.trim();
}
