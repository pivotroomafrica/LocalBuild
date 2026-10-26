import type { Metadata } from "next";
import { Inter, Noto_Sans_Ethiopic } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./site.css";
import { isProductionSite, siteUrl } from "@/lib/site";

/** Inter carries all UI text (weights 400/500/600); Satoshi Bold is the
 * display face for headings and the wordmark (website design). */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Amharic text (the home page quote). Only loaded where it is used. */
const notoEthiopic = Noto_Sans_Ethiopic({
  variable: "--font-noto-ethiopic",
  subsets: ["ethiopic"],
  weight: ["500", "700"],
  preload: false,
});

/** Satoshi Bold: headings and the Pivotroom wordmark (BrandLogo). */
const satoshi = localFont({
  src: "./fonts/Satoshi-Bold.woff2",
  variable: "--font-satoshi",
  weight: "700",
  display: "swap",
});

/**
 * Material Symbols Outlined, weight 400 -- the one icon family the
 * guideline specifies (section 16). Self-hosted from the same guideline
 * bundle rather than a Google Fonts stylesheet dependency, so icons
 * render offline/in this sandbox identically to production.
 */
const materialSymbols = localFont({
  src: "./fonts/MaterialSymbolsOutlined.woff2",
  variable: "--font-material-symbols",
  weight: "400",
  display: "swap",
});

const appUrl = siteUrl();

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  // Staging and local copies stay out of search results.
  ...(isProductionSite() ? {} : { robots: { index: false, follow: false } }),
  title: "Pivotroom",
  description: "One hour with someone who has done it. Book a paid one-to-one session with a vetted Ethiopian founder, executive or professional.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoEthiopic.variable} ${satoshi.variable} ${materialSymbols.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
