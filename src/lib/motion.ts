/** Whether the user has asked their system for reduced motion. Browser only. */
export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
