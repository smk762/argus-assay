// @vitest-environment jsdom
// pack-argus-assay-f954fe57cd: useLoad never shows one item's data for another. A review page that moves
// from draft A to draft B must not show A's content while its actions act on B, nor next to B's error.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useLoad } from "./bits";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { data: string | null; error: string | null };
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

/** Mount a probe whose load for `id` resolves or rejects only when the test says so. */
function probe() {
  const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  const seen: Seen[] = [];
  let reload = () => {};
  function Probe({ id }: { id: string }) {
    const loaded = useLoad(() => new Promise<string>((resolve, reject) => pending.set(id, { resolve, reject })), [id]);
    const { data, error } = loaded;
    reload = loaded.reload;
    seen.push({ data, error });
    return null;
  }
  const el = document.createElement("div");
  root = createRoot(el);
  return {
    seen,
    last: () => seen[seen.length - 1],
    show: (id: string) => act(() => root!.render(<Probe id={id} />)),
    reload: () => act(() => reload()),
    resolve: async (id: string, v: string) => act(async () => pending.get(id)!.resolve(v)),
    reject: async (id: string, e: string) => act(async () => pending.get(id)!.reject(new Error(e))),
  };
}

describe("useLoad", () => {
  it("shows nothing of A once the page is for B, until B arrives", async () => {
    const p = probe();
    p.show("A");
    await p.resolve("A", "draft A");
    expect(p.last()).toEqual({ data: "draft A", error: null });
    const before = p.seen.length;
    p.show("B");
    // Every render for B, from the first, is free of A's data.
    expect(p.seen.slice(before).every((s) => s.data !== "draft A")).toBe(true);
    expect(p.last()).toEqual({ data: null, error: null });
    await p.resolve("B", "draft B");
    expect(p.last()).toEqual({ data: "draft B", error: null });
  });

  it("never shows A's data next to B's error", async () => {
    const p = probe();
    p.show("A");
    await p.resolve("A", "draft A");
    p.show("B");
    await p.reject("B", "no draft B");
    expect(p.last()).toEqual({ data: null, error: "no draft B" });
  });

  it("keeps A's data when a reload of A fails, so a poll keeps going", async () => {
    const p = probe();
    p.show("A");
    await p.resolve("A", "draft A");
    p.reload();
    await p.reject("A", "dropped");
    expect(p.last()).toEqual({ data: "draft A", error: "dropped" });
    p.reload();
    await p.resolve("A", "draft A again");
    expect(p.last()).toEqual({ data: "draft A again", error: null });
  });

  it("ignores a late answer for A after the page moved to B", async () => {
    const p = probe();
    p.show("A");
    p.show("B");
    await p.resolve("A", "draft A");
    expect(p.last().data).toBeNull();
  });
});
