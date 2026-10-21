/**
 * Returns `word` for a count of one and `word` plus "s" otherwise.
 * Every unit the app counts in (day, week, check-in) is a regular noun, so
 * this covers them all without an i18n library.
 */
export function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
