import type { MetadataRoute } from "next";

/**
 * Web app manifest: makes Pivotroom installable ("Add to Home Screen" /
 * "Install app") with the brand mark as its icon (brand guidelines v1.0:
 * white mark on an ink tile). Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pivotroom.Africa",
    short_name: "Pivotroom",
    description:
      "One hour with someone who has done it. Book a paid one-to-one session with a vetted Ethiopian founder, executive or professional.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#0D0F12",
    categories: ["business", "education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find an expert", url: "/experts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My sessions", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
