import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./intro-theme.css";

/** Plus Jakarta Sans carries all UI and headings; Newsreader is the serif
 * accent face of the intro design. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/** Satoshi Bold is kept only for the Pivotroom wordmark (BrandLogo). */
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
      className={`${jakarta.variable} ${newsreader.variable} ${satoshi.variable} ${materialSymbols.variable} h-full antialiased`}
    >
      <body className="intro-theme min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
