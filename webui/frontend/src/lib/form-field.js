/**
 * The app's native fields use the kit's field contract: the same height,
 * underline, leading and focus as `TextField`/`SelectField`. The labels and
 * product behaviour stay with the component that owns the field.
 */
import { fieldControlClass } from '@monos/ui/field';

/**
 * @param {{extraClass?: string}} [opts]
 * @returns {string} Tailwind class string
 */
export function formFieldClass(opts = {}) {
  const { extraClass = '' } = opts;
  return fieldControlClass({ extraClass });
}
