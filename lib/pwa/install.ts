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

export type InstallState = "unavailable" | "prompt" | "ios" | "installed";

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

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "unavailable";
}

export const getServerInstallState = (): InstallState => "unavailable";

/** Shows the browser's own install dialog. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}
