/**
 * How a phone or tablet adds a web app to its Home Screen, which decides
 * the steps the install guide shows.
 *
 * - `ios`: Add to Home Screen lives in the Share sheet. Safari 26 moved
 *   Share behind the ⋯ button next to the address bar (`shareInMenu`);
 *   older Safari has it in the toolbar. Other iOS browsers (Chrome, Edge,
 *   Firefox) share from their own menus.
 * - `android`: the browser's ⋮ menu, or a one-tap install prompt when the
 *   browser offers one.
 * - `other`: computers and anything else; the guide is not offered.
 */
export type InstallPlatform =
  | { kind: "ios"; browser: "safari" | "other"; shareInMenu: boolean }
  | { kind: "android" }
  | { kind: "other" };

/** iOS browsers that are not Safari name themselves in the user agent. */
const OTHER_IOS_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|Instagram/;

/**
 * Reads the platform from the user agent. iPads on iPadOS 13 and later
 * report themselves as a Mac, so a "Mac" with a touch screen is an iPad.
 * Android tablets asking for the desktop site report Linux, so Linux on a
 * touch-only screen (`touchOnly`: no mouse or trackpad) is Android.
 * Safari's own version comes from `Version/NN`, because iOS 26 froze the
 * OS version in the user agent at 18.
 */
export function detectInstallPlatform(
  userAgent: string,
  maxTouchPoints: number,
  touchOnly = false,
): InstallPlatform {
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (isIos) {
    if (OTHER_IOS_BROWSER.test(userAgent)) {
      return { kind: "ios", browser: "other", shareInMenu: false };
    }
    const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1] ?? 0);
    return { kind: "ios", browser: "safari", shareInMenu: version >= 26 };
  }
  if (/Android/.test(userAgent)) return { kind: "android" };
  if (/Linux/.test(userAgent) && maxTouchPoints > 0 && touchOnly) return { kind: "android" };
  return { kind: "other" };
}
