import { describe, expect, it } from "vitest";

import { boxStyle, cropFraction, displaySlots, windowAspect } from "./slots";
import type { FrameInfo } from "./types";

const frame = {
  id: "card-green",
  version: 1,
  status: "draft",
  overlay: "card-green-v1.png",
  window: { x: 81, y: 159, width: 808, height: 593 },
  texts: { name: { x: 0, y: 0, width: 1, height: 1 }, bio: { x: 0, y: 0, width: 1, height: 1 }, class: { x: 0, y: 0, width: 1, height: 1 } },
} as unknown as FrameInfo["frame"];

describe("frame slots", () => {
  it("leaves name and bio to argus-mint", () => {
    expect(displaySlots(frame)).toEqual(["class"]);
    expect(displaySlots(null)).toEqual([]);
  });
  it("positions boxes as percentages", () => {
    expect(boxStyle({ x: 50, y: 0, width: 25, height: 100 }, 100, 200)).toEqual({ left: "50.000%", top: "0.000%", width: "25.000%", height: "50.000%" });
  });
  it("suggests the render size closest to the window", () => {
    expect(windowAspect(frame).suggest).toBe("1152×896");
  });
  it("measures what cover-fit crops", () => {
    expect(cropFraction(1024, 1024, frame)).toBeCloseTo(0.266, 2);
    expect(cropFraction(1152, 896, frame)).toBeCloseTo(0.057, 2);
  });
});
