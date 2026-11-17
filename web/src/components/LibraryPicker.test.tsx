// pack-argus-assay-a1aecc704e: a variable filter lists only real values. An item that lacks the variable
// must not add a blank, unkeyed option (a second "Any …" that filters nothing).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LibraryListing } from "@/lib/types";

import { LibraryPicker } from "./LibraryPicker";

const item = (id: string, variables: Record<string, string>) => ({ id, model: "sdxl/a.safetensors", variables, seed: 1, group: "g", width: 64, height: 64 });
const library = {
  template: "t",
  template_version: 1,
  models: ["sdxl/a.safetensors"],
  items: [item("1", { role: "knight", colour: "red" }), item("2", { role: "mage" })],
  count: 2,
  failed: [],
} as unknown as LibraryListing;

describe("LibraryPicker", () => {
  it("offers each variable's values and no blank option for an item that lacks it", () => {
    const html = renderToStaticMarkup(<LibraryPicker library={library} selected={null} onSelect={() => {}} />);
    const colour = /<select[^>]*aria-label="colour"[^>]*>(.*?)<\/select>/.exec(html)?.[1] ?? "";
    const options = [...colour.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
    expect(options.map((o) => o.text)).toEqual(["Any colour", "red"]);
    expect(options[1].attrs).toContain('value="red"');
  });
});
