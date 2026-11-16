import { describe, expect, it } from "vitest";

import { draftHref, parseFilter, queuePosition } from "./queue";
import type { DraftSummary } from "./types";

const d = (id: string, status: string, awaiting: string[] = []) => ({ id, status, awaiting }) as unknown as DraftSummary;
const items = [d("a", "pending", ["moderator", "owner"]), d("b", "approved"), d("c", "pending", ["owner"]), d("e", "pending", ["moderator"])];

describe("stepping through the queue from a draft's page", () => {
  it("follows the filter it came from, wrapping at both ends", () => {
    expect(queuePosition(items, "a", "moderator")).toEqual({ n: 1, total: 2, prev: "e", next: "e", filter: "moderator" });
    expect(queuePosition(items, "c", "pending")).toEqual({ n: 2, total: 3, prev: "a", next: "e", filter: "pending" });
    expect(queuePosition(items, "e", "all")).toEqual({ n: 4, total: 4, prev: "c", next: "a", filter: "all" });
  });
  it("falls back to the whole queue when the draft has left the filter", () => {
    expect(queuePosition(items, "b", "pending")).toEqual({ n: 2, total: 4, prev: "a", next: "c", filter: "all" });
    expect(queuePosition(items, "zz", "all")).toBeNull();
  });
  it("reads and writes the filter in the URL", () => {
    expect(parseFilter("rejected")).toBe("rejected");
    expect(parseFilter("nonsense")).toBe("all");
    expect(parseFilter(null, "moderator")).toBe("moderator");
    expect(draftHref("a", "pending")).toBe("/drafts/a?status=pending");
    expect(draftHref("a", "all")).toBe("/drafts/a");
  });
});
