import type { DraftStatus, DraftSummary } from "./types";

/** The review queue's filters, in the order its tabs show them. */
export type Filter = "moderator" | DraftStatus | "all";
export const FILTERS: { key: Filter; label: string }[] = [
  { key: "moderator", label: "Needs the moderator" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "published", label: "Published" },
  { key: "all", label: "All" },
];

export const matches = (d: DraftSummary, f: Filter) =>
  f === "all" ? true : f === "moderator" ? d.status === "pending" && d.awaiting.includes("moderator") : d.status === f;

/** A `?status=` value as a filter; anything else (or nothing) is `fallback`. */
export const parseFilter = (value: string | null | undefined, fallback: Filter = "all"): Filter =>
  FILTERS.find((f) => f.key === value)?.key ?? fallback;

/** A draft's page, remembering the queue filter it was opened from (a query, so the static export's one page per draft serves it). */
export const draftHref = (id: string, filter: Filter) => `/drafts/${id}/${filter === "all" ? "" : `?status=${filter}`}`;

/**
 * Where `id` sits in `items` (the queue's order) under `filter`: its 1-based position, the count, and the ids
 * before and after it, wrapping at both ends. A draft that has left the filter (reviewed in this tab) is placed
 * in the whole queue instead, and `filter` comes back as "all".
 */
export function queuePosition(items: DraftSummary[], id: string, filter: Filter) {
  let list = items.filter((d) => matches(d, filter));
  let f = filter;
  if (!list.some((d) => d.id === id)) {
    list = items;
    f = "all";
  }
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const n = list.length;
  return { n: i + 1, total: n, prev: list[(i - 1 + n) % n].id, next: list[(i + 1) % n].id, filter: f };
}
