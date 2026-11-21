"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/lib/push/actions";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Push notifications on this device: bookings, changes, reminders (071).
 * On iPhone/iPad they only work in the installed app (iOS 16.4+), so
 * there it explains how to install first.
 */
export function NotificationsToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "blocked";
      } else {
        next = (await currentSubscription().catch(() => null)) ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration("/")) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }));
      const result = await savePushSubscriptionAction(subscription.toJSON(), navigator.userAgent);
      if (result.error) {
        setNote({ kind: "err", text: result.error });
        return;
      }
      setState("on");
      setNote({ kind: "ok", text: "Notifications are on for this device." });
    } catch {
      setNote({ kind: "err", text: "Notifications couldn't be turned on here. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const result = await sendTestPushAction().catch(() => ({ error: "Couldn't send a test just now." }));
    setBusy(false);
    setNote(result.error ? { kind: "err", text: result.error } : { kind: "ok", text: "Test sent. It should appear in a moment." });
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <section className="notif-card" aria-labelledby="notif-title">
      <span className="notif-icon ms" aria-hidden="true">
        {state === "on" ? "notifications_active" : "notifications"}
      </span>
      <div className="notif-body">
        <h2 id="notif-title" className="notif-title">
          {state === "on" ? "Notifications are on" : "Get notified"}
        </h2>
        <p className="notif-text">
          {state === "ios-install"
            ? "On iPhone and iPad, notifications work in the installed app: tap Share, then Add to Home Screen, open Pivotroom from your home screen and turn them on here."
            : state === "blocked"
              ? "Notifications are blocked for Pivotroom in this browser. Allow them in the browser's site settings, then come back."
              : state === "on"
                ? "We'll tell you on this device about bookings, changes, payments and reminders."
                : "Bookings, changes, payments and reminders, straight to this device."}
        </p>
        {note ? (
          <p className={note.kind === "ok" ? "notif-note ok" : "notif-note err"} role="status">
            {note.text}
          </p>
        ) : null}
      </div>
      {state === "off" ? (
        <button type="button" className="btn btn-ink md" onClick={() => void turnOn()} disabled={busy}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
      ) : state === "on" ? (
        <div className="notif-actions">
          <button type="button" className="btn btn-line md" onClick={() => void test()} disabled={busy}>
            Send a test
          </button>
          <button type="button" className="textbtn" onClick={() => void turnOff()} disabled={busy}>
            Turn off
          </button>
        </div>
      ) : null}
    </section>
  );
}
