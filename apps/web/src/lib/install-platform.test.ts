import { describe, expect, test } from "bun:test";
import { detectInstallPlatform } from "./install-platform";

const IPHONE_SAFARI_26 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_SAFARI_18 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const LINUX_DESKTOP_MODE =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("detectInstallPlatform", () => {
  test("Safari 26 on iPhone keeps Share behind the ⋯ menu", () => {
    expect(detectInstallPlatform(IPHONE_SAFARI_26, 5)).toEqual({
      kind: "ios",
      browser: "safari",
      shareInMenu: true,
    });
  });

  test("older Safari has Share in the toolbar", () => {
    expect(detectInstallPlatform(IPHONE_SAFARI_18, 5)).toEqual({
      kind: "ios",
      browser: "safari",
      shareInMenu: false,
    });
  });

  test("another browser on iPhone shares from its own menu", () => {
    expect(detectInstallPlatform(IPHONE_CHROME, 5)).toEqual({
      kind: "ios",
      browser: "other",
      shareInMenu: false,
    });
  });

  test("an iPad that reports a Mac is still iOS, by its touch points", () => {
    expect(detectInstallPlatform(IPAD_SAFARI_DESKTOP_UA, 5)).toEqual({
      kind: "ios",
      browser: "safari",
      shareInMenu: true,
    });
  });

  test("a real Mac is not iOS", () => {
    expect(detectInstallPlatform(IPAD_SAFARI_DESKTOP_UA, 0)).toEqual({ kind: "other" });
  });

  test("Android", () => {
    expect(detectInstallPlatform(ANDROID_CHROME, 5)).toEqual({ kind: "android" });
  });

  test("desktop", () => {
    expect(detectInstallPlatform(WINDOWS_CHROME, 0)).toEqual({ kind: "other" });
  });

  test("an Android tablet asking for the desktop site is still Android, by its touch-only screen", () => {
    expect(detectInstallPlatform(LINUX_DESKTOP_MODE, 5, true)).toEqual({ kind: "android" });
  });

  test("a touch laptop with a mouse or trackpad is not offered the guide", () => {
    expect(detectInstallPlatform(WINDOWS_CHROME, 10, false)).toEqual({ kind: "other" });
    expect(detectInstallPlatform(LINUX_DESKTOP_MODE, 5, false)).toEqual({ kind: "other" });
  });
});
