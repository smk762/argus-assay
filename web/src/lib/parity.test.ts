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
import { saveDoc } from "./projects";
import { parseTape } from "./tape";
import type { DraftList, ProjectDetail, ProjectFile, ProjectList, SampleJobList, SavedProjectFile } from "./types";

const FIXTURE = fileURLToPath(new URL("../../../fixture", import.meta.url));
const MOCK = fileURLToPath(new URL("../../../scripts/mock_mint.mjs", import.meta.url));

/** What the static demo turns off on purpose: it renders nothing, so it can't make drafts or samples, and it writes no project file. */
const STATIC_ONLY = { create_drafts: false, sample: false, author_catalogue: false };

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

/** Like `same`, and both must refuse it: a 4xx, not merely the same answer (two wrong 200s would agree). */
async function refused(m: DemoMint, path: string, body: Record<string, unknown>) {
  const [a, b] = [await fromMock("POST", path, body), fromDemo(m, "POST", path, body)];
  expect(b.status, `POST ${path}: status`).toBe(a.status);
  expect(a.status, `POST ${path}: refused`).toBeGreaterThanOrEqual(400);
  expect(a.status, `POST ${path}: refused, not failed`).toBeLessThan(500);
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

  it("serve the same teaser projects, as recorded", async () => {
    const m = demo();
    const list = (await same(m, "GET", "/projects")) as ProjectList;
    for (const p of list.projects) await same(m, "GET", `/projects/${p.id}`);
  });

  it("answer the same for what isn't there", async () => {
    const m = demo();
    for (const path of ["/drafts/nope", "/samples/nope", "/nope", "/templates/demo-portrait/1/check", "/projects/nope"]) await same(m, "GET", path);
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
    // A second moderator review of the same image, and a review of no draft, are refused by both.
    await refused(m, `/drafts/${pending!.id}/review`, { role: "moderator", approve: true, by: "parity", note: "" });
    await refused(m, "/drafts/nope/review", { role: "moderator", approve: true, by: "parity", note: "" });

    // A decision that is neither approve nor retire is refused, and leaves the draft template a draft.
    for (const decision of [undefined, "reject"]) await refused(m, "/templates/demo-portrait/2/review", { decision, by: "parity" });
    await same(m, "GET", "/templates");
    // A draft template approved, an approved frame retired, and the lists agree afterwards.
    await same(m, "POST", "/templates/demo-portrait/2/review", { decision: "approve", by: "parity" });
    await same(m, "POST", "/frames/card-green/1/review", { decision: "retire", by: "parity" });
    await refused(m, "/templates/nope/1/review", { decision: "approve", by: "parity" });
    for (const path of ["/templates", "/frames", "/drafts"]) await same(m, "GET", path);
  });
});

describe("teaser project authoring: the mock keeps it in memory, the hosted demo has none", { timeout: 20_000 }, () => {
  const file = (kind: string, id: string, version = 1) => `/projects/parity-project/files/${kind}/${id}/${version}`;

  it("refuses every project write in the hosted demo, which says it can't author", () => {
    const m = demo();
    expect((m.get("/health").body as { capabilities: Record<string, boolean> }).capabilities.author_catalogue).toBe(false);
    expect(m.post(file("project", "parity-project"), { doc: { title: "Parity" } }).status).toBe(503);
    expect(m.post(`${file("project", "parity-project")}/review`, { decision: "approve", by: "parity" }).status).toBe(503);
  });

  it("saves drafts, refuses what argus-mint refuses, and keeps reviews until it restarts", async () => {
    expect(((await fromMock("GET", "/health")).body as { capabilities: Record<string, boolean> }).capabilities.author_catalogue).toBe(true);
    // A file before its project, review keys in a save, an id that isn't the project's: all refused.
    expect((await fromMock("POST", file("line", "a"), { doc: { voice: "v", text: "Hello.", source: "s" } })).status).toBe(404);
    expect((await fromMock("POST", file("project", "parity-project"), { doc: { title: "Parity", status: "approved" } })).status).toBe(422);
    expect((await fromMock("POST", file("project", "other"), { doc: { title: "Parity" } })).status).toBe(422);

    const saved = (await fromMock("POST", file("project", "parity-project"), { doc: { title: "Parity" } })).body as SavedProjectFile;
    expect(saved.file).toMatchObject({ kind: "project", id: "parity-project", version: 1, status: "draft", file: "project.yaml" });
    expect(saved.file.doc).toMatchObject({ policy: "default", family: "sdxl", generated_label: true });
    expect(saved.checks.guard_ran).toBe(false);
    const ident = { voice: "keeper", presence: "embodied", prompt: "an old keeper" };
    expect((await fromMock("POST", file("identity", "keeper"), { doc: { ...ident, presence: "viewpoint" } })).status).toBe(422);
    expect((await fromMock("POST", file("identity", "keeper"), { doc: ident })).status).toBe(200);

    const list = (await fromMock("GET", "/projects")).body as ProjectList;
    expect(list.projects).toContainEqual({ id: "parity-project", title: "Parity", status: "draft" });
    const detail = (await fromMock("GET", "/projects/parity-project")).body as ProjectDetail;
    expect(detail.files.map((f) => `${f.kind} ${f.id} v${f.version}`)).toEqual(["project parity-project v1", "identity keeper v1"]);

    // No darkroom behind the mock: SingGuard judged nothing, so argus-mint's refusal for that is the answer.
    const refusal = await fromMock("POST", `${file("project", "parity-project")}/review`, { decision: "approve", by: "parity" });
    expect(refusal.status).toBe(409);
    expect((refusal.body as { detail: string }).detail).toMatch(/SingGuard can't check this text/);
    expect((await fromMock("POST", `${file("project", "parity-project")}/review`, { decision: "reject", by: "parity" })).status).toBe(422);
    expect((await fromMock("POST", `${file("project", "parity-project")}/review`, { decision: "retire", by: "parity" })).status).toBe(409);
    expect((await fromMock("POST", `${file("scene", "nope")}/review`, { decision: "approve", by: "parity" })).status).toBe(404);
  });

  it("approves a recorded draft whose verdicts still hold, and then refuses to change it", async () => {
    const list = (await fromMock("GET", "/projects")).body as ProjectList;
    const recorded = list.projects.find((p) => p.id !== "parity-project");
    if (!recorded) return; // a fixture recorded before teaser projects has none
    const detail = (await fromMock("GET", `/projects/${recorded.id}`)).body as ProjectDetail;
    const passing = (f: ProjectFile) => {
      const prefix = `${f.kind} ${f.id} v${f.version}: `;
      const mine = detail.checks.guard.filter((c) => c.field.startsWith(prefix));
      return mine.length > 0 && mine.every((c) => c.passed);
    };
    const draft = detail.files.find((f) => f.status === "draft" && f.kind !== "teasers" && passing(f));
    if (!draft) return;
    const path = `/projects/${recorded.id}/files/${draft.kind}/${draft.id}/${draft.version}`;
    const approved = (await fromMock("POST", `${path}/review`, { decision: "approve", by: "parity" })).body as ProjectFile;
    expect(approved.status).toBe("approved");
    expect(approved.doc).toMatchObject({ status: "approved", approved_by: "parity" });
    // An approved file never changes: saving it again is refused (a change is a new version).
    expect((await fromMock("POST", path, { doc: saveDoc(approved.doc) })).status).toBe(409);
    const after = (await fromMock("GET", `/projects/${recorded.id}`)).body as ProjectDetail;
    expect(after.files.find((f) => f.kind === draft.kind && f.id === draft.id)?.status).toBe("approved");
  });
});
