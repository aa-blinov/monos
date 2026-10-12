/**
 * Shared class string for underline-style form fields (title inputs, folder
 * selects, etc.) so that `<input>` and `<select>` render text on the same
 * baseline. Without an explicit `text-sm` + `leading-6` the native select uses
 * its own font-size/line-height and the two fields visibly misalign.
 *
 * Height is declared (`h-9`), not derived from padding + line-height: a derived
 * height added a 1px `border-b` and came out 37px on Settings against 36px
 * elsewhere. The base rule for `input[type="text"]` in app.css deliberately
 * carries no vertical geometry — written outside @layer it landed after the
 * utilities in the output and overrode this height wholesale.
 *
 * @param {{extraClass?: string}} [opts]
 * @returns {string} Tailwind class string
 */
export function formFieldClass(opts = {}) {
  const { extraClass = '' } = opts;
  const base = 'h-9 w-full bg-transparent border-b border-[var(--border-subtle)] px-1 text-sm leading-6 outline-none transition focus:border-[var(--text-secondary)]';
  let out = base;
  if (extraClass) out = `${out} ${extraClass}`;
  return out.trim();
}
