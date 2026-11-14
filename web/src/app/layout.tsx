import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { headers } from "next/headers";

import { MintProvider } from "@/components/MintProvider";
import { Shell } from "@/components/Shell";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Argus Assay",
  description: "Review for argus-mint: card drafts, templates, frames and bios, before anything is pinned or signed.",
};

// Runs before paint so a saved theme does not flash the system one first. It sets the
// color-scheme meta too, so the canvas is the right colour before the stylesheet arrives.
const THEME_BOOT = `try{var t=localStorage.getItem("assay-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.querySelector('meta[name="color-scheme"]').content=t}}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce from proxy.ts; the CSP refuses any inline script without it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" suppressHydrationWarning />
        {/* Browsers hide a nonce from the DOM after parsing, so the attribute never matches on hydration. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <MintProvider>
          <Shell>{children}</Shell>
        </MintProvider>
      </body>
    </html>
  );
}
