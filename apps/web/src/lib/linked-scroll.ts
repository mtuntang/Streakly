/**
 * Maps a scroll position on one row to the matching position on another:
 * halfway between item 2 and item 3 on one is halfway between them on the
 * other, whatever the two rows' item sizes.
 */
export function mapScroll(from: number[], to: number[], left: number): number {
  const n = Math.min(from.length, to.length);
  if (n === 0) return 0;
  if (n === 1 || left <= from[0]) return to[0];
  for (let i = 0; i < n - 1; i++) {
    const a = from[i];
    const b = from[i + 1];
    if (left <= b) {
      const t = b === a ? 0 : (left - a) / (b - a);
      return to[i] + t * (to[i + 1] - to[i]);
    }
  }
  return to[n - 1];
}
