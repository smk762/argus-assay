"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import Link from "next/link";
import { useState } from "react";

import { DraftBadge, PageTitle, useLoad } from "@/components/bits";
import { Button, Notice, Spinner } from "@/components/ui";
import { draftImage, getDrafts } from "@/lib/api";
import { awaitingText, shortAddress } from "@/lib/status";
import { when } from "@/lib/time";
import type { DraftStatus, DraftSummary } from "@/lib/types";

type Filter = "moderator" | DraftStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "moderator", label: "Needs the moderator" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "published", label: "Published" },
  { key: "all", label: "All" },
];

const matches = (d: DraftSummary, f: Filter) =>
  f === "all" ? true : f === "moderator" ? d.status === "pending" && d.awaiting.includes("moderator") : d.status === f;

export default function Queue() {
  const [filter, setFilter] = useState<Filter>("moderator");
  const { data, error, reload } = useLoad(() => getDrafts());
  const items = (data?.items ?? []).filter((d) => matches(d, filter));
  return (
    <>
      <PageTitle aside={<Button small onClick={reload}>Refresh</Button>}>Review queue</PageTitle>
      <div role="tablist" aria-label="Filter drafts" className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count = (data?.items ?? []).filter((d) => matches(d, f.key)).length;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1.5 text-small ${filter === f.key ? "bg-interactive text-white" : "bg-base-800 text-text-secondary hover:bg-base-700"}`}
            >
              {f.label} <span className="opacity-70">{data ? count : ""}</span>
            </button>
          );
        })}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!data && !error ? <Spinner /> : null}
      {data && items.length === 0 ? <p className="text-small text-text-muted">Nothing here.</p> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/drafts/${d.id}`} className="block overflow-hidden rounded-lg border border-base-600/60 bg-base-800 hover:border-interactive">
              <img src={draftImage(d.id, "image", d.image_sha256)} alt={`Card image of ${d.name}`} loading="lazy" className="aspect-[5/7] w-full bg-base-900 object-contain" />
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{d.name}</span>
                  <DraftBadge status={d.status} />
                </div>
                <p className="text-caption text-text-muted">{(d.status === "pending" && awaitingText(d.awaiting)) || `${d.template.id} v${d.template.version}`}</p>
                <p className="text-caption text-text-muted">
                  for {shortAddress(d.to)} · {when(d.created_at)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
