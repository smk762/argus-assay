"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { wireCompatible } from "@/lib/status";
import { WIRE_MAJOR } from "@/lib/types";

import { useMint } from "./MintProvider";
import { ThemeToggle } from "./ThemeToggle";
import { TokenButton } from "./TokenDialog";
import { Notice, Tip } from "./ui";

const NAV = [
  { href: "/", label: "Review queue", match: (p: string) => p === "/" || p.startsWith("/drafts") },
  { href: "/new", label: "New draft", match: (p: string) => p === "/new" },
  { href: "/catalogue", label: "Catalogue", match: (p: string) => p.startsWith("/catalogue") },
  { href: "/samples", label: "Samples", match: (p: string) => p.startsWith("/samples") },
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
          <HealthDot />
          <TokenButton />
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
      </footer>
    </div>
  );
}
