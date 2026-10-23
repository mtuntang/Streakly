"use client";

import * as React from "react";
import { detectInstallPlatform, type InstallPlatform } from "@/lib/install-platform";

/** Chrome's install prompt event; not in the DOM typings. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Window event that opens the install guide, from anywhere on the page. */
const OPEN_GUIDE_EVENT = "streakly:open-install-guide";

export type InstallState = {
  platform: InstallPlatform;
  /** Running from the Home Screen already, so there is nothing to install. */
  installed: boolean;
  /** The browser offered its own one-tap install (Chrome on Android). */
  canPrompt: boolean;
};

/** What the server and the first client render see: nothing to offer. */
const SERVER_STATE: InstallState = { platform: { kind: "other" }, installed: true, canPrompt: false };

let deferredPrompt: InstallPromptEvent | null = null;
let installedNow = false;
let state: InstallState | null = null;
const listeners = new Set<() => void>();

function emit() {
  state = null;
  listeners.forEach((listener) => listener());
}

// Chrome fires these once per page, possibly before any component mounts,
// so they are caught as soon as this module loads in the browser. Holding
// on to the prompt also stops Chrome's own install banner, because the
// app offers the same install from its tip and account menu.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedNow = true;
    deferredPrompt = null;
    emit();
  });
}

/** Whether the page runs as an installed app rather than in a browser tab. */
function runningInstalled(): boolean {
  return (
    installedNow ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getSnapshot(): InstallState {
  if (!state) {
    const platform = detectInstallPlatform(
      navigator.userAgent,
      navigator.maxTouchPoints,
      !window.matchMedia("(any-pointer: fine)").matches,
    );
    state = {
      platform,
      installed: runningInstalled(),
      // The one-tap prompt is an Android thing. Desktop Chrome offers one
      // too, and it would install the desktop app from a page that only
      // looks like a phone (DevTools device mode), so it's ignored there.
      canPrompt: deferredPrompt !== null && platform.kind === "android",
    };
  }
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tracks whether Streakly can be added to this device's Home Screen, and
 * how. Phones and tablets only, and never once it is installed.
 */
export function useInstall() {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
  return {
    ...snapshot,
    available: snapshot.platform.kind !== "other" && !snapshot.installed,
  };
}

/**
 * Shows the browser's own install prompt. The prompt can be shown only
 * once, so it is dropped afterwards; Chrome offers a new one on a later
 * visit if this one was dismissed.
 */
export async function promptInstall(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  emit();
  await prompt.prompt();
  await prompt.userChoice;
}

/** Opens the install guide: the one-tap prompt where there is one. */
export function startInstall() {
  if (getSnapshot().canPrompt) void promptInstall();
  else window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
}

/** Calls `open` whenever something on the page asks for the guide. */
export function useOpenGuideRequest(open: () => void) {
  React.useEffect(() => {
    window.addEventListener(OPEN_GUIDE_EVENT, open);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, open);
  }, [open]);
}
