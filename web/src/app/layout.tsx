import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";

import { MintProvider } from "@/components/MintProvider";
import { Shell } from "@/components/Shell";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Argus Assay",
  description: "Review for argus-mint: card drafts, templates, frames and bios, before anything is pinned or signed.",
};

// Runs before paint so a saved theme does not flash the system one first.
const THEME_BOOT = `try{var t=localStorage.getItem("assay-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <MintProvider>
          <Shell>{children}</Shell>
        </MintProvider>
      </body>
    </html>
  );
}
