"use client";

/**
 * Install state shared by every "Install the app" button. Chrome/Edge/
 * Android fire `beforeinstallprompt` once, early, so it is caught here as
 * soon as this module loads (PwaRegister, in the root layout) and kept for
 * a button to use later. iPhone/iPad Safari has no prompt: people use
 * Share -> Add to Home Screen, so the button explains that instead.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = "unavailable" | "prompt" | "ios" | "android-other" | "installed";

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Android browsers other than Chrome and Samsung Internet (Brave, Firefox,
 * Opera...) can only put a shortcut on the home screen: the browser's
 * badge on the icon, and notifications labelled with the browser's name.
 * Chrome and Samsung Internet install a real app instead (in the app
 * drawer, its own notifications), so people are pointed there.
 */
function isAndroidShortcutOnly(): boolean {
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  if ((navigator as Navigator & { brave?: unknown }).brave) return true;
  if (/SamsungBrowser/i.test(ua)) return false;
  return !/Chrome\//.test(ua) || /EdgA|OPR|Opera|YaBrowser|UCBrowser|Firefox|FxiOS|DuckDuckGo|; wv\)/i.test(ua);
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (isAndroidShortcutOnly()) return "android-other";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "unavailable";
}

export const getServerInstallState = (): InstallState => "unavailable";

/** Shows the browser's own install dialog. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}
