import type { CatalogueStatus, DraftStatus, Health } from "./types";

export type Tone = "ok" | "warning" | "error" | "muted" | "info";

/** A status always has a mark and a word as well as a colour. */
export const DRAFT_STATUS: Record<DraftStatus, { label: string; mark: string; tone: Tone }> = {
  pending: { label: "Pending review", mark: "…", tone: "warning" },
  approved: { label: "Approved", mark: "✓", tone: "ok" },
  rejected: { label: "Rejected", mark: "✕", tone: "error" },
  published: { label: "Published", mark: "◆", tone: "info" },
};

export const CATALOGUE_STATUS: Record<CatalogueStatus, { label: string; mark: string; tone: Tone }> = {
  draft: { label: "Draft", mark: "…", tone: "warning" },
  approved: { label: "Approved", mark: "✓", tone: "ok" },
  retired: { label: "Retired", mark: "–", tone: "muted" },
};

const ROLE_LABEL: Record<string, string> = { moderator: "the moderator", owner: "the owner" };

/** "Waiting for the moderator and the owner", from the server's `awaiting`. */
export function awaitingText(awaiting: string[]): string {
  if (awaiting.length === 0) return "";
  return `Waiting for ${awaiting.map((role) => ROLE_LABEL[role] ?? role).join(" and ")}`;
}

/** The moderator can decide when the draft is pending and they haven't yet. */
export const moderatorCanReview = (status: DraftStatus, awaiting: string[]): boolean =>
  status === "pending" && awaiting.includes("moderator");

export const ownerCanReview = (status: DraftStatus, awaiting: string[]): boolean =>
  status === "pending" && awaiting.includes("owner");

export const canPublish = (status: DraftStatus, health: Health | null): boolean =>
  status === "approved" && Boolean(health?.capabilities.publish);

/** Which catalogue decision applies: a draft can be approved, an approved file retired. */
export function catalogueAction(status: CatalogueStatus): "approve" | "retire" | null {
  if (status === "draft") return "approve";
  if (status === "approved") return "retire";
  return null;
}

/** Whether this build understands the server's wire version. */
export const wireCompatible = (version: string, major: string): boolean => version.split(".", 1)[0] === major;

export function shortHash(hash: string, chars = 10): string {
  const body = hash.startsWith("0x") ? hash.slice(2) : hash;
  return body.length > chars ? `${hash.startsWith("0x") ? "0x" : ""}${body.slice(0, chars)}…` : hash;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
