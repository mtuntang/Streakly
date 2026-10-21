/**
 * Gives a short buzz when `event` came from a finger, on phones that
 * support vibration. Mouse drags stay silent, and so does iOS, which has no
 * vibration API for the web.
 */
export function buzzForTouch(event: Event | null | undefined, ms: number) {
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    navigator.vibrate?.(ms);
  }
}
