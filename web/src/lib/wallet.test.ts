import { describe, expect, it } from "vitest";

import { sameAddress, toHex } from "./wallet";

describe("wallet helpers", () => {
  it("hex-encodes UTF-8 for personal_sign", () => {
    expect(toHex("hi ✓")).toBe("0x686920e29c93");
  });
  it("compares addresses without case", () => {
    expect(sameAddress("0xAbC", "0xabc")).toBe(true);
  });
});
