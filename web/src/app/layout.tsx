import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { DemoStrip, STRIP_LABEL } from "@/components/DemoStrip";
import { MintProvider } from "@/components/MintProvider";
import { Shell } from "@/components/Shell";
import { staticDemo } from "@/lib/demo";

import "./globals.css";

const DESCRIPTION = "Review for argus-mint: card drafts, templates, frames and bios, before anything is pinned or signed.";
const DEMO_DESCRIPTION =
  "Argus Assay, the review UI for argus-mint's provenance cards: moderator and owner approvals, the owner's card editor and the catalogue, replayed from sample data.";

export const metadata: Metadata = {
  title: staticDemo() ? "Argus Assay demo · Dragonhound Labs" : "Argus Assay",
  description: staticDemo() ? DEMO_DESCRIPTION : DESCRIPTION,
  // Favicons: argus-cortex brand/packages/mint/favicon/, copied unchanged. favicon.ico, icon.svg and
  // apple-icon.png sit in src/app/ and Next emits their tags; icon-192/512 in public/ are for the manifest.
  manifest: "/site.webmanifest",
};

// The browser chrome follows the page: the family's --dh-bg values (a <meta> can't read a CSS variable).
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121416" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Live: the per-request nonce from proxy.live.ts; the CSP refuses any script without it. The static
  // export has no request (and no headers()): scripts/csp.mjs hashes its scripts instead.
  const nonce = staticDemo() ? undefined : ((await headers()).get("x-nonce") ?? undefined);
  return (
    // data-dh-label="browser" (STRIP_LABEL): the strip reads "Live demo · runs in your browser". The
    // moderator and owner actions run live in this tab; nothing is a recording. The family's flag for it, as
    // on the pasted strips; DemoStrip renders that suffix itself. Without the strip (the live build) it does nothing.
    <html lang="en" data-dh-label={STRIP_LABEL} suppressHydrationWarning>
      <head>
        {/*
          The family theme script (public/dh-theme.js, a copy of vendor/dh/dh-theme.js). A plain blocking
          <script src>, first in <head>, so the saved choice (the `dh-theme` cookie, shared across
          *.dragonhound.dev) is on <html> before the first paint. The static build adds the same tag in
          scripts/csp.mjs instead, next to its Trusted Types policy: React would create this element through
          innerHTML on a client render, which that policy blocks. Browsers hide a nonce from the DOM after
          parsing, so the attribute never matches on hydration.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- blocking on purpose: it must set the theme before first paint */}
        {staticDemo() ? null : <script nonce={nonce} src="/dh-theme.js" suppressHydrationWarning />}
      </head>
      <body className="min-h-dvh">
        {staticDemo() ? <DemoStrip /> : null}
        <MintProvider>
          <Shell>{children}</Shell>
        </MintProvider>
      </body>
    </html>
  );
}
