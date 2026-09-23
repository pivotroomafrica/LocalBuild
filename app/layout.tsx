import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Inter carries everything but names (UI, body, credentials, forms,
 * metadata, prices, tables) -- guideline section 07. Weights 400/500
 * only; the guideline never calls for 600/700 Inter anywhere.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/**
 * Satoshi carries names: hero headlines, expert names, section heads,
 * major statistics. Weight 700 only -- the guideline specifies a single
 * weight for this face throughout. Self-hosted from the file extracted
 * directly out of the brand guideline's own embedded font bundle
 * (Fontshare-licensed, free), not approximated with a Google Fonts
 * lookalike.
 */
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

export const metadata: Metadata = {
  title: "Pivotroom",
  description: "Talk to someone who's already been there.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${satoshi.variable} ${materialSymbols.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
