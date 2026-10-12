/**
 * The address visitors actually used (e.g. https://pivotroom.africa).
 *
 * Behind a reverse proxy / hosting panel (cPanel Passenger, nginx, a CDN)
 * the Node server only sees its own internal address, so `request.url`
 * can read http://0.0.0.0:3000/... and every redirect built from it sends
 * visitors somewhere unreachable. The proxy forwards the real host in the
 * `x-forwarded-host` / `host` headers, so read those first and fall back to
 * request.url only when neither is present (plain local dev).
 *
 * The protocol is always https for a public host (these sites are served
 * over HTTPS even when the proxy talks to the app over plain HTTP) and
 * http for local hosts unless the proxy says otherwise.
 */
function firstValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function isLocalHost(host: string): boolean {
  const hostname = host.replace(/:\d+$/, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]";
}

export function publicOrigin(request: { headers: Headers; url: string }): string {
  const host = firstValue(request.headers.get("x-forwarded-host")) ?? firstValue(request.headers.get("host"));
  if (!host || host.replace(/:\d+$/, "") === "0.0.0.0") {
    return new URL(request.url).origin;
  }

  // Next fills in x-forwarded-proto: http itself when the proxy sends none,
  // so that header can't be trusted to mean "plain http" for a public host.
  // Real sites here are HTTPS-only; only local hosts may use http.
  const forwardedProto = firstValue(request.headers.get("x-forwarded-proto"));
  const protocol = isLocalHost(host) ? (forwardedProto === "https" ? "https" : "http") : "https";
  return `${protocol}://${host}`;
}
