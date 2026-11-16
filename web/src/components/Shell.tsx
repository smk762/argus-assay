"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { getDemoProvenance } from "@/lib/api";
import { MINT_PYPI_URL, MINT_REPO_URL, REPO_URL, staticDemo } from "@/lib/demo";
import { wireCompatible } from "@/lib/status";
import { WIRE_MAJOR } from "@/lib/types";

import { useLoad } from "./bits";
import { useMint } from "./MintProvider";
import { ThemeToggle } from "./ThemeToggle";
import { TokenButton } from "./TokenDialog";
import { Notice, Tip } from "./ui";

const NAV = [
  { href: "/", label: "Review queue", match: (p: string) => p === "/" || p.startsWith("/drafts") },
  { href: "/new", label: "New draft", match: (p: string) => p === "/new" },
  { href: "/library", label: "Library", match: (p: string) => p.startsWith("/library") },
  { href: "/catalogue", label: "Catalogue", match: (p: string) => p.startsWith("/catalogue") },
  { href: "/samples", label: "Samples", match: (p: string) => p.startsWith("/samples") },
  { href: "/docs", label: "Docs", match: (p: string) => p.startsWith("/docs") },
];

function HealthDot() {
  const { health, error } = useMint();
  const down = health ? Object.entries(health.backends).filter(([, up]) => !up).map(([name]) => name) : [];
  const [mark, tone, label] = error
    ? ["✕", "bg-error", `argus-mint is not reachable: ${error}`]
    : !health
      ? ["…", "bg-base-600", "Waiting for argus-mint"]
      : down.length
        ? ["!", "bg-warning", `argus-mint ${health.version} on ${health.network}; not answering: ${down.join(", ")}`]
        : ["✓", "bg-success", `argus-mint ${health.version} on ${health.network}; all backends answer`];
  return (
    <Tip label={label}>
      <span role="status" aria-label={label} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-caption font-bold text-on-shield ${tone}`}>
        {mark}
      </span>
    </Tip>
  );
}

/** The static demo's stand-in for the health dot: what the page is showing, and from what. */
function DemoBadge() {
  const { data } = useLoad(() => getDemoProvenance());
  const sample = data?.kind !== "recorded";
  const label = sample
    ? "Sample data: argus-mint's recorded API fixture, with stand-in renders, local CIDs and a throwaway wallet. Nothing here was pinned or minted."
    : `Recorded from argus-mint ${data?.mint_version ?? ""} on ${data?.recorded_at.slice(0, 10) ?? ""}.`;
  return (
    <Tip label={label}>
      <span role="status" aria-label={label} className={sample ? "dh-badge dh-badge--sample" : "dh-badge"}>
        {sample ? "Sample data" : "Recorded"}
      </span>
    </Tip>
  );
}

const FOOT_LINK = "underline decoration-base-600 underline-offset-2 hover:text-text-secondary";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { health } = useMint();
  const incompatible = health && !wireCompatible(health.wire_version ?? "1.0", WIRE_MAJOR);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-600/60 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-subheading font-semibold text-text-primary">
          Argus Assay
        </Link>
        <span className="hidden text-caption text-text-muted md:inline">
          review for{" "}
          <a href="https://github.com/smk762/argus-mint" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
            argus-mint
          </a>
        </span>
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-small ${active ? "bg-base-700 text-text-primary" : "text-text-secondary hover:bg-base-700 hover:text-text-primary"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {staticDemo() ? <DemoBadge /> : <HealthDot />}
          {/* The demo checks no token: the moderator's controls are on without one. */}
          {staticDemo() ? null : <TokenButton />}
          <ThemeToggle />
        </div>
      </header>
      {incompatible ? (
        <Notice tone="error" className="mx-4 mt-4 sm:mx-6">
          argus-mint speaks wire {health.wire_version}; this build understands {WIRE_MAJOR}.x. Upgrade assay.
        </Notice>
      ) : null}
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      <footer className="border-t border-base-600/60 px-4 py-3 text-caption text-text-muted sm:px-6">
        Assay shows what argus-mint decided and recorded; it decides nothing itself. Nothing is pinned or signed until the moderator and the owner
        have both approved the exact image.
        {staticDemo() ? (
          <p className="mt-1">
            This demo replays argus-mint&apos;s API fixture in your browser: reviews, edits and catalogue decisions stay in this tab until you reload, and
            &ldquo;publishing&rdquo; shows the fixture&apos;s recorded result. Source:{" "}
            <a href={REPO_URL} className={FOOT_LINK}>
              argus-assay
            </a>
            ,{" "}
            <a href={MINT_REPO_URL} className={FOOT_LINK}>
              argus-mint
            </a>{" "}
            (
            <a href={MINT_PYPI_URL} className={FOOT_LINK}>
              PyPI
            </a>
            ).
          </p>
        ) : null}
      </footer>
    </div>
  );
}
