/**
 * The hosted demo's in-browser argus-mint (lib/demoMint.ts) and the mock server (scripts/mock_mint.mjs)
 * stand in for the same argus-mint over the same fixture/, so they must answer alike (argus-assay#42).
 * Both are asked the same requests; status codes and bodies must match, apart from what the static
 * demo turns off on purpose (it has no GPU: no new drafts, no sample runs).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildTape } from "../../../scripts/make_tape.mjs";
import { DemoMint } from "./demoMint";
import { parseTape } from "./tape";
import type { DraftList, SampleJobList } from "./types";

const FIXTURE = fileURLToPath(new URL("../../../fixture", import.meta.url));
const MOCK = fileURLToPath(new URL("../../../scripts/mock_mint.mjs", import.meta.url));

/** What the static demo turns off on purpose: it renders nothing, so it can't make drafts or samples. */
const STATIC_ONLY = { create_drafts: false, sample: false };

let mock: ChildProcess;
let base = "";

beforeAll(async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  mock = spawn(process.execPath, [MOCK], { env: { ...process.env, MOCK_PORT: String(port), MOCK_STEP_MS: "0" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((resolve, reject) => {
    mock.stdout!.on("data", (b: Buffer) => b.toString().includes("mock argus-mint on") && resolve());
    mock.on("exit", (code) => reject(new Error(`the mock exited (${code})`)));
  });
  base = `http://127.0.0.1:${port}`;
}, 20_000);

afterAll(() => {
  mock?.kill();
});

const demo = () => new DemoMint(parseTape(buildTape(FIXTURE)));

async function fromMock(method: "GET" | "POST", path: string, body?: unknown) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : null };
}

const fromDemo = (m: DemoMint, method: "GET" | "POST", path: string, body?: Record<string, unknown>) =>
  method === "GET" ? m.get(path) : m.post(path, structuredClone(body ?? {}));

const started = Date.now();
/** A time either side stamped during this test (a review's `at`) reads "<now>": each takes its own clock. Recorded times compare as they are. */
const stamped = (body: unknown): unknown =>
  JSON.parse(JSON.stringify(body), (_k, v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Date.parse(v) >= started - 1000 ? "<now>" : v));

/** Same status; same body where both answered with one. A 4xx/5xx compares by status only (the wording may differ). */
async function same(m: DemoMint, method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  const [a, b] = [await fromMock(method, path, body), fromDemo(m, method, path, body)];
  expect(b.status, `${method} ${path}: status`).toBe(a.status);
  if (a.status < 300) expect(stamped(b.body), `${method} ${path}: body`).toEqual(stamped(a.body));
  return a.body as unknown;
}

describe("the in-browser argus-mint and the mock answer alike", { timeout: 20_000 }, () => {
  it("report the same /health, apart from what the static demo can't do", async () => {
    const a = (await fromMock("GET", "/health")).body as { capabilities: Record<string, boolean> };
    const b = demo().get("/health").body as { capabilities: Record<string, boolean> };
    expect(b).toEqual({ ...a, capabilities: { ...a.capabilities, ...STATIC_ONLY } });
  });

  it("serve the same catalogue, library, drafts and sample jobs", async () => {
    const m = demo();
    for (const path of ["/templates", "/frames", "/bios", "/library", "/drafts", "/drafts?status=pending", "/samples"]) await same(m, "GET", path);
    const drafts = (await fromMock("GET", "/drafts")).body as DraftList;
    for (const d of drafts.items) await same(m, "GET", `/drafts/${d.id}`);
    const samples = (await fromMock("GET", "/samples")).body as SampleJobList;
    for (const s of samples.items) await same(m, "GET", `/samples/${s.id}`);
  });

  it("answer the same for what isn't there", async () => {
    const m = demo();
    for (const path of ["/drafts/nope", "/samples/nope", "/nope", "/templates/demo-portrait/1/check"]) await same(m, "GET", path);
  });

  it("walk a moderator review and a catalogue decision the same way", async () => {
    const m = demo();
    const pending = ((await fromMock("GET", "/drafts?status=pending")).body as DraftList).items.find((d) => d.awaiting.includes("moderator"));
    expect(pending, "the fixture has a draft awaiting the moderator").toBeTruthy();
    const after = (await same(m, "POST", `/drafts/${pending!.id}/review`, { role: "moderator", approve: true, by: "parity", note: "" })) as {
      status: string;
      awaiting: string[];
    };
    expect(after.awaiting).not.toContain("moderator");
    // A second moderator review of the same image is refused by both.
    await same(m, "POST", `/drafts/${pending!.id}/review`, { role: "moderator", approve: true, by: "parity", note: "" });
    await same(m, "POST", "/drafts/nope/review", { role: "moderator", approve: true, by: "parity", note: "" });

    // A draft template approved, an approved frame retired, and the lists agree afterwards.
    await same(m, "POST", "/templates/demo-portrait/2/review", { decision: "approve", by: "parity" });
    await same(m, "POST", "/frames/card-green/1/review", { decision: "retire", by: "parity" });
    await same(m, "POST", "/templates/nope/1/review", { decision: "approve", by: "parity" });
    for (const path of ["/templates", "/frames", "/drafts"]) await same(m, "GET", path);
  });
});
