"use client";

import { useState, useSyncExternalStore } from "react";
import { getInstallState, getServerInstallState, promptInstall, subscribeInstall } from "@/lib/pwa/install";

/**
 * "Install the app": the browser's install dialog where it has one
 * (Chrome, Edge, Android), steps for iPhone/iPad, and nothing once the
 * app is installed or the browser can't install it.
 */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const [showSteps, setShowSteps] = useState(false);

  if (state === "unavailable" || state === "installed") return null;

  return (
    <div className={`install-app ${className}`}>
      <button
        type="button"
        className="install-app-btn"
        aria-expanded={state === "ios" ? showSteps : undefined}
        onClick={() => (state === "prompt" ? void promptInstall() : setShowSteps((open) => !open))}
      >
        <span className="ms" aria-hidden="true">
          install_mobile
        </span>
        Install the app
      </button>
      {state === "ios" && showSteps ? (
        <p className="install-app-steps" role="status">
          Tap{" "}
          <span className="ms" aria-label="Share">
            ios_share
          </span>{" "}
          <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
        </p>
      ) : null}
    </div>
  );
}
