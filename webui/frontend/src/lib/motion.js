/**
 * Scroll behavior for jumps inside the app (outline, headings). Smooth by
 * default; instant when the user asked for less motion. The scroll itself still
 * happens: only the animation is dropped.
 */
export function scrollBehavior() {
  const asksLessMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return asksLessMotion ? 'auto' : 'smooth';
}
