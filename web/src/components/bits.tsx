"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CATALOGUE_STATUS, DRAFT_STATUS, shortHash, type Tone } from "@/lib/status";
import type { CatalogueStatus, DraftStatus } from "@/lib/types";

import { Badge } from "./ui";

const TONE: Record<Tone, string> = {
  ok: "border-success/50 text-success",
  warning: "border-warning/50 text-warning",
  error: "border-error/50 text-error",
  info: "border-info/50 text-info",
  muted: "border-base-600 text-text-muted",
};

export function DraftBadge({ status }: { status: DraftStatus }) {
  const s = DRAFT_STATUS[status];
  return (
    <Badge className={TONE[s.tone]}>
      <span aria-hidden="true">{s.mark}</span>
      {s.label}
    </Badge>
  );
}

export function CatalogueBadge({ status }: { status: CatalogueStatus }) {
  const s = CATALOGUE_STATUS[status];
  return (
    <Badge className={TONE[s.tone]}>
      <span aria-hidden="true">{s.mark}</span>
      {s.label}
    </Badge>
  );
}

/** A hash shown short, full on hover, copyable. */
export function Hash({ value, chars = 10 }: { value: string; chars?: number }) {
  return (
    <code title={value} className="font-mono text-caption text-text-secondary">
      {shortHash(value, chars)}
    </code>
  );
}

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-heading font-semibold">{children}</h1>
      {aside}
    </div>
  );
}

/** Load once on mount (and when `deps` change); `reload` to refetch. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => {
        if (live) {
          setData(value);
          setError(null);
        }
      },
      (e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-small">
      <span className="mb-1 block font-medium text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-caption text-text-muted">{hint}</span> : null}
    </label>
  );
}

export const INPUT =
  "w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-small text-text-primary placeholder:text-text-muted focus:border-interactive";
