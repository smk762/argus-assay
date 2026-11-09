import { describe, expect, it } from "vitest";

import { awaitingText, canPublish, catalogueAction, moderatorCanReview, ownerCanReview, shortHash, wireCompatible } from "./status";
import type { Health } from "./types";

const health = (publish: boolean) => ({ capabilities: { publish } }) as unknown as Health;

describe("draft status", () => {
  it("names who is still to review", () => {
    expect(awaitingText(["moderator", "owner"])).toBe("Waiting for the moderator and the owner");
    expect(awaitingText([])).toBe("");
  });
  it("lets each role decide once, only while pending", () => {
    expect(moderatorCanReview("pending", ["moderator", "owner"])).toBe(true);
    expect(moderatorCanReview("pending", ["owner"])).toBe(false);
    expect(ownerCanReview("rejected", ["owner"])).toBe(false);
  });
  it("publishes only approved drafts on a server that can", () => {
    expect(canPublish("approved", health(true))).toBe(true);
    expect(canPublish("approved", health(false))).toBe(false);
    expect(canPublish("pending", health(true))).toBe(false);
  });
});

describe("catalogue", () => {
  it("approves drafts and retires approved files, nothing else", () => {
    expect(catalogueAction("draft")).toBe("approve");
    expect(catalogueAction("approved")).toBe("retire");
    expect(catalogueAction("retired")).toBeNull();
  });
});

describe("wire and formatting", () => {
  it("compares wire majors", () => {
    expect(wireCompatible("1.1", "1")).toBe(true);
    expect(wireCompatible("2.0", "1")).toBe(false);
  });
  it("shortens hashes", () => {
    expect(shortHash("0x0123456789abcdef")).toBe("0x0123456789…");
  });
});
