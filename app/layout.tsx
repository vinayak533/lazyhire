import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LazyHire", template: "%s · LazyHire" },
  description: "An AI-first career operating system for focused job progress.",
};

/**
 * The CSP script nonce is minted per request in proxy.ts, and Next can only
 * stamp it onto the scripts of a page it renders for that request. A page
 * prerendered at build time would ship scripts carrying a stale nonce or none
 * at all, and the browser would refuse to hydrate it. Every page here is
 * private and already sent with no-store, so nothing is lost by rendering them
 * on demand.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
