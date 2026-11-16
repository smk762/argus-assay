import { describe, expect, it } from "vitest";

import { keyStep, step } from "./step";

describe("stepping through an enlarged view", () => {
  it("wraps at both ends", () => {
    expect(step(0, -1, 5)).toBe(4);
    expect(step(4, 1, 5)).toBe(0);
    expect(step(2, 1, 5)).toBe(3);
    expect(step(0, 1, 1)).toBe(0);
    expect(step(0, 1, 0)).toBeNull();
  });
  it("takes the arrow keys, but not with a modifier", () => {
    expect(keyStep({ key: "ArrowLeft" })).toBe(-1);
    expect(keyStep({ key: "ArrowRight" })).toBe(1);
    expect(keyStep({ key: "ArrowRight", altKey: true })).toBe(0);
    expect(keyStep({ key: "Enter" })).toBe(0);
  });
});
