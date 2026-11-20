import { describe, expect, it } from "vitest";

import { catalogueHref, catalogueRefParam, parseCatalogueRef } from "./catalogueRoute";

describe("a catalogue page's route", () => {
  it("keeps a global file's URL as it was, and puts a project's frame one level deeper", () => {
    expect(catalogueHref("frame", "card-green", 1)).toBe("/catalogue/frame/card-green/1");
    expect(catalogueHref("template", "demo-portrait", 2)).toBe("/catalogue/template/demo-portrait/2");
    expect(catalogueHref("frame", "example-teasers/harbour-feed", 1)).toBe("/catalogue/frame/example-teasers/harbour-feed/1");
    expect(catalogueRefParam("example-teasers/harbour-feed", 1)).toEqual(["example-teasers", "harbour-feed", "1"]);
  });

  it("reads the id and version back, whichever way the id's '/' arrived", () => {
    expect(parseCatalogueRef("frame", ["card-green", "1"])).toEqual({ id: "card-green", version: 1 });
    expect(parseCatalogueRef("frame", ["example-teasers", "harbour-feed", "1"])).toEqual({ id: "example-teasers/harbour-feed", version: 1 });
    expect(parseCatalogueRef("frame", ["example-teasers%2Fharbour-feed", "3"])).toEqual({ id: "example-teasers/harbour-feed", version: 3 });
    expect(parseCatalogueRef("template", ["demo-portrait", "2"])).toEqual({ id: "demo-portrait", version: 2 });
  });

  it("names nothing for a malformed route: no version, a two-part template id, three parts, or a bad segment", () => {
    for (const [kind, ref] of [
      ["frame", ["card-green"]],
      ["frame", undefined],
      ["frame", ["card-green", "v1"]],
      ["frame", ["card-green", "0"]],
      ["template", ["a", "b", "1"]],
      ["bio", ["a", "b", "1"]],
      ["frame", ["a", "b", "c", "1"]],
      ["frame", ["A", "1"]],
      ["frame", ["%E0%A4%A", "1"]],
    ] as const)
      expect(parseCatalogueRef(kind, ref as string[] | undefined)).toBeNull();
  });
});
