import { describe, expect, it } from "vitest";

import { allowedModels, awaitingText, byFamily, checkpointName, diffEdit, draftSources, isAutoReview, loraChoices, loraOptions, loraText, modelFamily, samplingText, canPublish, catalogueAction, moderatorCanReview, ownerCanReview, shortHash, wireCompatible } from "./status";
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

describe("text edits", () => {
  const current = { name: "Hana", bio: "A line.", texts: { class: "Ranger" } };
  it("sends only what changed", () => {
    expect(diffEdit(current, { name: "Hana", bio: "A line.", texts: { class: "Ranger" } })).toBeNull();
    expect(diffEdit(current, { name: "Hana II", bio: "A line.", texts: { class: "Ranger", stats: "No. 1" } })).toEqual({
      name: "Hana II",
      texts: { stats: "No. 1" },
    });
    expect(diffEdit(current, { name: "Hana", bio: "A line.", texts: { class: "" } })).toEqual({ texts: { class: "" } });
  });
  it("recognises the platform's review", () => {
    expect(isAutoReview("auto: platform checks")).toBe(true);
    expect(isAutoReview("moderator-1")).toBe(false);
  });
});

describe("checkpoints", () => {
  it("names them briefly and keeps the default first", () => {
    expect(checkpointName("sdxl/juggernautXL_ragnarokBy/juggernautXL_ragnarokBy.safetensors")).toBe("juggernautXL_ragnarokBy");
    expect(allowedModels({ model: "b", models: ["a", "b", "c"] })).toEqual(["b", "a", "c"]);
    expect(allowedModels({ model: "b" })).toEqual(["b"]);
  });
  it("offers a render only with darkroom, and the library only where it is served", () => {
    const at = (darkroom: boolean, library?: boolean) => ({ backends: { darkroom }, capabilities: { library } }) as unknown as Health;
    expect(draftSources(at(true))).toEqual({ render: true, library: false });
    expect(draftSources(at(false, true))).toEqual({ render: false, library: true });
    expect(draftSources(null)).toEqual({ render: false, library: false });
  });
});

describe("families and LoRAs", () => {
  const sdxl = "sdxl/a/a.safetensors";
  const flux = "flux/f.safetensors";
  const t = {
    max_loras: 2,
    lora_options: [
      { name: "sdxl/detail.safetensors", weights: [0.8, 0.5], models: [sdxl] },
      { name: "flux/glow.safetensors", models: [flux] },
      { name: "any.safetensors", weights: [1, 0.6] },
    ],
  };
  it("groups checkpoints by their top folder, in the order given", () => {
    expect(modelFamily(sdxl)).toBe("sdxl");
    expect(modelFamily("loose.safetensors")).toBe("");
    expect(byFamily([sdxl, flux, "sdxl/b.safetensors"])).toEqual([
      { family: "sdxl", models: [sdxl, "sdxl/b.safetensors"] },
      { family: "flux", models: [flux] },
    ]);
  });
  it("offers only the LoRAs that pair with the checkpoint", () => {
    expect(loraOptions(t, sdxl).map((o) => o.name)).toEqual(["sdxl/detail.safetensors", "any.safetensors"]);
    expect(loraOptions(t, flux).map((o) => o.name)).toEqual(["flux/glow.safetensors", "any.safetensors"]);
    expect(loraOptions({}, sdxl)).toEqual([]);
  });
  it("sends only picks argus-mint would accept", () => {
    const picked = { "sdxl/detail.safetensors": 0.5, "flux/glow.safetensors": 1, "any.safetensors": 0.7 };
    // The flux LoRA doesn't pair with an SDXL checkpoint, and 0.7 isn't an allowed weight (the first is used).
    expect(loraChoices(picked, t, sdxl)).toEqual([
      { name: "sdxl/detail.safetensors", weight: 0.5 },
      { name: "any.safetensors", weight: 1 },
    ]);
    expect(loraChoices(picked, { ...t, max_loras: 1 }, sdxl)).toHaveLength(1);
    expect(loraChoices(picked, { lora_options: t.lora_options }, flux)).toEqual([{ name: "flux/glow.safetensors", weight: 1 }]);
    expect(loraChoices({}, t, sdxl)).toEqual([]);
  });
  it("writes LoRAs and sampling for the record", () => {
    expect(loraText([{ name: "sdxl/detail.safetensors", weight: 0.8 }, { name: "any.safetensors" }])).toBe("detail @ 0.8, any @ 1");
    expect(samplingText({ sampler: "euler", scheduler: "simple", steps: 20, cfg: 1, guidance: 3.5 })).toBe("euler / simple, 20 steps, cfg 1, guidance 3.5");
    expect(samplingText({ sampler: "dpmpp_2m", scheduler: "karras", steps: 30, cfg: 6, clip_skip: 2 })).toBe("dpmpp_2m / karras, 30 steps, cfg 6, clip skip 2");
  });
});
