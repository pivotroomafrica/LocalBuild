/**
 * Digital Asset Links for the Android app (a Trusted Web Activity built
 * from this site, for Google Play). It proves to Android that the app and
 * pivotroom.africa belong together, so the app opens the site full screen
 * with no browser bar, and its notifications are the app's own.
 *
 * Set in the hosting environment (not secrets; they're public by design):
 *   ANDROID_APP_PACKAGE       e.g. africa.pivotroom.app
 *   ANDROID_APP_FINGERPRINTS  the app signing key's SHA-256 fingerprint(s)
 *                             from Play Console, comma-separated
 * Empty list until both are set.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_APP_PACKAGE?.trim();
  const fingerprints = (process.env.ANDROID_APP_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

  const body =
    pkg && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
          },
        ]
      : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
