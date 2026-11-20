/**
 * A teaser project's own frames are named `<project>/<name>` (argus-mint wire 1.16), so a frame id can hold a `/`
 * (argus-assay#55). The committed fixture records the example project's `harbour-feed`; this test takes a copy of
 * the fixture with that frame back at draft (or a hand-made one, for a fixture without it) and checks:
 *   - the tape path: nested directories (`frames/<project>/<name>/<v>/…`), the same in make_tape.mjs, lib/tape.ts and
 *     the client's static branch, while the live client still sends the id encoded (`%2F`), which argus-mint takes;
 *   - parity: the mock and the in-browser argus-mint route the two-part id alike, with the `/` plain or encoded.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildTape, frameDir } from "../../../scripts/make_tape.mjs";
import { DemoMint, frameRoute } from "./demoMint";
import { frameTapeDir, parseTape } from "./tape";
import type { FrameInfo } from "./types";

const FIXTURE = fileURLToPath(new URL("../../../fixture", import.meta.url));
const MOCK = fileURLToPath(new URL("../../../scripts/mock_mint.mjs", import.meta.url));
const ID = "example-teasers/harbour-feed";
const FROM = "example-teaser"; // a recorded frame whose overlay and fonts the hand-made one borrows

let dir = "";
let mock: ChildProcess;
let base = "";

/** fixture/ with the project frame as a draft, so the review walk below can approve it and then retire it.
 * A fixture recorded before argus-mint's project frames has none: one is hand-made from FROM, its files where
 * record_demo.py writes them. */
function withProjectFrame(): string {
  const out = mkdtempSync(join(tmpdir(), "assay-frame-ids-"));
  cpSync(FIXTURE, out, { recursive: true });
  const frames = JSON.parse(readFileSync(join(out, "frames.json"), "utf8")) as FrameInfo[];
  const draft = { status: "draft" as const, approved_by: null, approved_at: null };
  const recorded = frames.find((f) => f.frame.id === ID);
  if (recorded) {
    recorded.frame = { ...recorded.frame, ...draft };
  } else {
    const from = frames.find((f) => f.frame.id === FROM)!;
    const frame = { ...structuredClone(from.frame), id: ID, version: 1, ...draft };
    frame.effects = [{ type: "scanlines", spacing: 4, thickness: 1, opacity: 0.18 }];
    frames.push({ ...from, frame, project: "example-teasers", file: "example-teasers/frames/harbour-feed-v1.yaml" });
    cpSync(join(out, "frames", FROM, "1"), join(out, ...frameDir(ID, 1).split("/")), { recursive: true });
  }
  writeFileSync(join(out, "frames.json"), JSON.stringify(frames));
  return out;
}

beforeAll(async () => {
  dir = withProjectFrame();
  const port = 20000 + Math.floor(Math.random() * 20000);
  mock = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_PORT: String(port), MOCK_STEP_MS: "0", MOCK_FIXTURE: dir },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve, reject) => {
    mock.stdout!.on("data", (b: Buffer) => b.toString().includes("mock argus-mint on") && resolve());
    mock.on("exit", (code) => reject(new Error(`the mock exited (${code})`)));
  });
  base = `http://127.0.0.1:${port}`;
}, 20_000);

afterAll(() => {
  mock?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const demo = () => new DemoMint(parseTape(buildTape(dir)));

async function fromMock(method: "GET" | "POST", path: string, body?: unknown) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}

describe("a frame id with a '/' (a project's own frame)", { timeout: 20_000 }, () => {
  it("parses one way, plain or encoded, and leaves a one-part id as it was", () => {
    for (const path of [`/frames/${ID}/1/layout`, `/frames/${encodeURIComponent(ID)}/1/layout`])
      expect(frameRoute(path)).toEqual({ id: ID, version: 1, what: "layout", rest: "" });
    expect(frameRoute("/frames/card-green/1/overlay")).toEqual({ id: "card-green", version: 1, what: "overlay", rest: "" });
    expect(frameRoute(`/frames/${encodeURIComponent(ID)}/1/fonts/fonts/A.ttf`)).toEqual({ id: ID, version: 1, what: "fonts", rest: "fonts/A.ttf" });
    // A name of digits is still a name: the version is the digits right before the fixed word.
    expect(frameRoute("/frames/p/7/2/review")).toEqual({ id: "p/7", version: 2, what: "review", rest: "" });
    for (const bad of ["/frames/a/b/c/1/overlay", "/frames/A/1/overlay", "/frames/x/v1/overlay", "/frames/%E0%A4%A/1/overlay"]) expect(frameRoute(bad)).toBeNull();
  });

  it("is on the tape in nested directories, where the page asks for it", () => {
    expect(frameTapeDir(ID, 1)).toBe("frames/example-teasers/harbour-feed/1");
    expect(frameDir(ID, 1)).toBe(frameTapeDir(ID, 1));
    const tape = parseTape(buildTape(dir));
    expect(tape.files).toContain(`${frameTapeDir(ID, 1)}/overlay.png`);
    expect(tape.files.some((f) => f.startsWith(`${frameTapeDir(ID, 1)}/fonts/`))).toBe(true);
    expect(tape.files.some((f) => f.includes("%"))).toBe(false);
    expect(tape.frames.find((f) => f.frame.id === ID)?.project).toBe("example-teasers");
  });

  it("refuses a tape whose frame has no overlay where the page would ask", () => {
    const broken = mkdtempSync(join(tmpdir(), "assay-frame-ids-"));
    try {
      cpSync(dir, broken, { recursive: true });
      rmSync(join(broken, "frames", "example-teasers"), { recursive: true });
      expect(() => buildTape(broken)).toThrow(/no overlay for frame\(s\) example-teasers\/harbour-feed v1/);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it("points the static demo at the nested tape path, and the live client at argus-mint with the id encoded", async () => {
    vi.stubEnv("NEXT_PUBLIC_ASSAY_STATIC", "1");
    let api = await import("./api");
    expect(api.frameOverlay(ID, 1)).toBe("/data-tape/frames/example-teasers/harbour-feed/1/overlay.png");
    expect(api.frameFont(ID, 1, "fonts/A B.ttf")).toBe("/data-tape/frames/example-teasers/harbour-feed/1/fonts/fonts/A%20B.ttf");
    expect(api.frameOverlay("card-green", 1)).toBe("/data-tape/frames/card-green/1/overlay.png");
    vi.unstubAllEnvs();
    vi.resetModules();
    api = await import("./api");
    expect(api.frameOverlay(ID, 1)).toMatch(/\/frames\/example-teasers%2Fharbour-feed\/1\/overlay$/);
    expect(api.frameFont(ID, 1, "fonts/A.ttf")).toMatch(/\/frames\/example-teasers%2Fharbour-feed\/1\/fonts\/fonts\/A\.ttf$/);
  });

  it("the mock serves its overlay and fonts from the same nested path, plain or encoded", async () => {
    const overlay = readFileSync(join(dir, frameTapeDir(ID, 1), "overlay.png"));
    for (const id of [ID, encodeURIComponent(ID)]) {
      const r = await fromMock("GET", `/frames/${id}/1/overlay`);
      expect(r.status).toBe(200);
      expect(Buffer.compare(r.body as Buffer, overlay)).toBe(0);
    }
    const font = buildTape(dir).files.find((f: string) => f.startsWith(`${frameTapeDir(ID, 1)}/fonts/`))!;
    const rel = font.slice(`${frameTapeDir(ID, 1)}/fonts/`.length);
    expect((await fromMock("GET", `/frames/${encodeURIComponent(ID)}/1/fonts/${rel}`)).status).toBe(200);
    expect((await fromMock("GET", `/frames/example-teasers%2Fnope/1/overlay`)).status).toBe(404);
  });

  it("the mock and the in-browser argus-mint answer alike: the list, the layout and the review", async () => {
    const m = demo();
    const list = await fromMock("GET", "/frames");
    expect(m.get("/frames")).toEqual({ status: 200, body: list.body });
    for (const id of [ID, encodeURIComponent(ID)]) {
      const path = `/frames/${id}/1/layout`;
      const body = { texts: { quote: "The lamp is lit." } };
      const [a, b] = [await fromMock("POST", path, body), m.post(path, structuredClone(body))];
      expect(a.status).toBe(200);
      expect(b).toEqual({ status: a.status, body: a.body });
    }
    // Approve with the `/` plain, then retire with it encoded: the same file both times, in both.
    const stamp = (x: unknown) => ({ ...(x as object), approved_at: "<today>" });
    for (const [id, decision, status] of [[ID, "approve", "approved"], [encodeURIComponent(ID), "retire", "retired"]] as const) {
      const path = `/frames/${id}/1/review`;
      const [a, b] = [await fromMock("POST", path, { decision, by: "me" }), m.post(path, { decision, by: "me" })];
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(b.body).toEqual(a.body);
      expect((a.body as { id: string; status: string })).toMatchObject({ id: ID, status });
    }
    const [a, b] = [await fromMock("GET", "/frames"), m.get("/frames")];
    const mine = (x: unknown) => (x as FrameInfo[]).find((f) => f.frame.id === ID)!.frame;
    expect(stamp(mine(b.body))).toEqual(stamp(mine(a.body)));
    expect(mine(a.body).status).toBe("retired");
    // A project's frame isn't a template's or a bio's: a two-part id there is not found, in both.
    const bad = `/templates/${encodeURIComponent(ID)}/1/review`;
    expect(m.post(bad, { decision: "approve", by: "me" }).status).toBe((await fromMock("POST", bad, { decision: "approve", by: "me" })).status);
    expect(existsSync(join(dir, "frames", encodeURIComponent(ID)))).toBe(false);
  });
});
