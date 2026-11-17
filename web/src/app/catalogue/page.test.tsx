// @vitest-environment jsdom
// pack-argus-assay-4740846802: catalogue rows are keyed unambiguously. Joined with no separator, "card1" v2 and
// "card" v12 both made "card12", and React reconciles the wrong row (a reviewer could open the wrong version).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, version: number) => ({
  template: { id, version, status: "draft", width: 64, height: 64 },
  hash: `0x${id}${version}`,
  combinations: 1,
});

vi.mock("@/lib/api", () => ({
  getTemplates: async () => [entry("card1", 2), entry("card", 12)],
  getFrames: async () => [],
  getBios: async () => [],
}));

describe("the catalogue list", () => {
  it("keys each row by id and version unambiguously", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: CataloguePage } = await import("./page");
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => root.render(<CataloguePage />));
    const titles = [...el.querySelectorAll("li > a > span:first-child")].map((s) => s.textContent);
    expect(titles).toEqual(["card1 v2", "card v12"]);
    expect(errors.mock.calls.map((c) => String(c[0])).filter((m) => /same key/i.test(m))).toEqual([]);
    act(() => root.unmount());
    errors.mockRestore();
  });
});
