import { describe, expect, it } from "vitest";

import { EFFECTS_NOT_PREVIEWED, effectsNotPreviewed, effectText } from "./frameEffects";

describe("the effects notice on an SVG preview", () => {
  it("is argus-mint's wording, word for word", () => {
    expect(EFFECTS_NOT_PREVIEWED).toBe("effects not previewed: the baked PNG is what's reviewed");
  });

  it("follows the frame's effects field alone: shown when it lists any, not when it is absent or empty", () => {
    expect(effectsNotPreviewed({})).toBe(false);
    expect(effectsNotPreviewed({ effects: undefined })).toBe(false);
    expect(effectsNotPreviewed({ effects: [] })).toBe(false);
    expect(effectsNotPreviewed({ effects: [{ type: "noise", amount: 0.06, monochrome: true }] })).toBe(true);
    expect(
      effectsNotPreviewed({
        effects: [
          { type: "barrel", strength: 0.12 },
          { type: "chromatic_aberration", shift: 2 },
          { type: "scanlines", spacing: 4, thickness: 1, opacity: 0.18 },
        ],
      }),
    ).toBe(true);
  });

  it("shows each effect as recorded: its name, then its parameters as argus-mint wrote them", () => {
    expect(effectText({ type: "barrel", strength: 0.12 })).toBe("lens bulge (barrel: strength 0.12)");
    expect(effectText({ type: "scanlines", spacing: 4, thickness: 1, opacity: 0.18 })).toBe("scanlines (scanlines: spacing 4, thickness 1, opacity 0.18)");
    expect(effectText({ type: "chromatic_aberration", shift: 2 })).toBe("colour fringing (chromatic_aberration: shift 2)");
  });
});
