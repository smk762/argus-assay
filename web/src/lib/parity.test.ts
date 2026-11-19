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
import type {
  Background,
  BackgroundSetList,
  DraftDetail,
  DraftList,
  ProjectDetail,
  ProjectFile,
  ProjectList,
  ProjectTracker,
  ReadyTeasers,
  SampleJobList,
  SavedProjectFile,
} from "./types";

// PARITY_FIXTURE runs the same checks over another recording (a dry run's: `make record-dry`), whose teaser
// layers (backgrounds, teaser drafts, the tracker, a post) the committed fixture may not have yet.
const FIXTURE = process.env.PARITY_FIXTURE ?? fileURLToPath(new URL("../../../fixture", import.meta.url));
const MOCK = fileURLToPath(new URL("../../../scripts/mock_mint.mjs", import.meta.url));

/**
 * What the static demo turns off on purpose: it renders nothing, so it can't make drafts, samples, backgrounds or
 * teaser drafts; it writes no project file and records no post; and it has no argus-proof or training siblings.
 */
const STATIC_ONLY = {
  create_drafts: false, sample: false, author_catalogue: false, backgrounds: false, teasers: false, post: false, identity_training: false, identity_check: false,
};

let mock: ChildProcess;
let base = "";

beforeAll(async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  mock = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_PORT: String(port), MOCK_STEP_MS: "0", MOCK_FIXTURE: FIXTURE },
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
    for (const path of ["/projects/nope/backgrounds", "/projects/nope/tracker", "/projects/nope/identities/x/1/training"]) await same(m, "GET", path);
  });

  it("serve the same teaser layers: backgrounds, the tracker, training views and posts ready", async () => {
    const m = demo();
    const list = (await same(m, "GET", "/projects")) as ProjectList;
    for (const p of list.projects) {
      const base = `/projects/${p.id}`;
      const detail = (await fromMock("GET", base)).body as ProjectDetail;
      await same(m, "GET", `${base}/backgrounds`);
      await same(m, "GET", `${base}/tracker`);
      for (const f of detail.files.filter((x) => x.kind === "scene")) await same(m, "GET", `${base}/scenes/${f.id}/${f.version}/backgrounds`);
      await same(m, "GET", `${base}/scenes/nope/1/backgrounds`);
      for (const f of detail.files.filter((x) => x.kind === "identity")) {
        await same(m, "GET", `${base}/identities/${f.id}/${f.version}/training`);
        await same(m, "GET", `${base}/identities/${f.id}/${f.version}/training/candidates/1`);
      }
      await same(m, "GET", `/posts/ready?project=${p.id}`);
    }
    for (const q of ["", "?limit=1", "?offset=1", "?limit=0", "?limit=201", "?project=Not_An_Id"]) await same(m, "GET", `/posts/ready${q}`);
  });

  it("list teaser drafts with their kind and teaser, as argus-mint's summaries do", async () => {
    const m = demo();
    const drafts = (await same(m, "GET", "/drafts")) as DraftList;
    for (const d of drafts.items) {
      expect(d.kind, d.id).toMatch(/^(card|teaser)$/);
      if (d.kind === "teaser") expect(d.teaser, d.id).toMatchObject({ project: expect.any(String), number: expect.stringMatching(/^T\d+$/) });
      else expect(d.teaser ?? null, d.id).toBeNull();
    }
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

describe("a teaser's layers: the mock takes argus-mint's writes in memory, the hosted demo none", { timeout: 20_000 }, () => {
  const OWNER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const projectIds = async () => ((await fromMock("GET", "/projects")).body as ProjectList).projects.map((p) => p.id);
  const teaserDrafts = async () => ((await fromMock("GET", "/drafts")).body as DraftList).items.filter((d) => d.kind === "teaser");

  it("refuses every layer write in the hosted demo, which says it can't do them", async () => {
    const m = demo();
    const caps = (m.get("/health").body as { capabilities: Record<string, boolean> }).capabilities;
    for (const c of ["backgrounds", "teasers", "post", "identity_training", "identity_check"]) expect(caps[c], c).toBe(false);
    for (const pid of await projectIds()) {
      for (const path of [
        `/projects/${pid}/scenes/lamp-room/1/backgrounds`,
        `/projects/${pid}/backgrounds/lamp-room-v1-01/review`,
        `/projects/${pid}/teasers/T1/draft`,
        `/projects/${pid}/identities/keeper/1/training/candidates`,
      ])
        expect(m.post(path, { decision: "approve", by: "parity", to: OWNER }).status, path).toBe(503);
    }
    for (const d of await teaserDrafts()) {
      expect(m.post(`/drafts/${d.id}/posted`, {}).status).toBe(503);
      expect(m.post(`/drafts/${d.id}/identity-check`, {}).status).toBe(503);
    }
  });

  it("refuses in the mock what a server without darkroom, proof or training siblings refuses", async () => {
    for (const pid of await projectIds()) {
      expect((await fromMock("POST", `/projects/${pid}/scenes/lamp-room/1/backgrounds`, {})).status).toBe(503);
      const training = await fromMock("POST", `/projects/${pid}/identities/keeper/1/training/candidates`, {});
      expect(training.status).toBe(503);
      expect((training.body as { detail: string }).detail).toMatch(/^identity training isn't set up here: no curator/);
      expect((await fromMock("POST", `/projects/${pid}/teasers/X1/draft`, { to: OWNER })).status).toBe(404);
      expect((await fromMock("POST", `/projects/${pid}/teasers/T1/draft`, { to: "not a wallet" })).status).toBe(422);
    }
    expect((await fromMock("POST", "/projects/nope/teasers/T1/draft", { to: OWNER })).status).toBe(404);
    for (const d of await teaserDrafts()) expect((await fromMock("POST", `/drafts/${d.id}/identity-check`, {})).status).toBe(503);
    const card = ((await fromMock("GET", "/drafts?status=approved")).body as DraftList).items.find((d) => d.kind !== "teaser");
    if (card) {
      const post = { where: "parity", url: null, at: new Date().toISOString(), sha256: card.image_sha256 };
      expect((await fromMock("POST", `/drafts/${card.id}/posted`, post)).status, "a card isn't posted").toBe(409);
    }
  });

  it("reviews a background once, bound to its image", async () => {
    for (const pid of await projectIds()) {
      const r = await fromMock("GET", `/projects/${pid}/backgrounds`);
      if (r.status !== 200) continue; // recorded before backgrounds
      const bgs = (r.body as BackgroundSetList).sets.flatMap((s) => s.backgrounds ?? []);
      expect((await fromMock("POST", `/projects/${pid}/backgrounds/nope/review`, { decision: "approve", by: "parity" })).status).toBe(404);
      for (const bg of bgs) {
        const path = `/projects/${pid}/backgrounds/${bg.id}/review`;
        expect((await fromMock("POST", path, { decision: "retire", by: "parity" })).status).toBe(422);
        if (bg.status === "pending") {
          const done = (await fromMock("POST", path, { decision: "approve", by: "parity", note: "" })).body as Background;
          expect(done).toMatchObject({ status: "approved", review: { decision: "approved", by: "parity", image_sha256: bg.sha256 } });
        }
        expect((await fromMock("POST", path, { decision: "reject", by: "parity", note: "again" })).status, `${bg.id} reviewed twice`).toBe(409);
      }
    }
  });

  it("copies a recorded teaser draft; the tracker and the posts ready follow the drafts", async () => {
    const recorded = await teaserDrafts();
    if (!recorded.length) return; // a fixture recorded before teaser drafts has none
    const one = recorded[0];
    const pid = one.teaser!.project;
    const made = await fromMock("POST", `/projects/${pid}/teasers/${one.teaser!.number}/draft`, { to: OWNER });
    expect(made.status).toBe(201);
    const copy = made.body as DraftDetail;
    expect(copy).toMatchObject({ status: "pending", awaiting: ["moderator", "owner"], posts: [] });
    const tracker = (await fromMock("GET", `/projects/${pid}/tracker`)).body as ProjectTracker;
    expect(tracker.teasers.find((t) => t.number === one.teaser!.number)?.drafts[0].id, "the newest draft first").toBe(copy.id);

    const ready = (await fromMock("GET", "/posts/ready")).body as ReadyTeasers;
    const approved = ready.items[0];
    if (!approved) return;
    const post = { where: "parity", url: "https://example.org/post/1", at: "2026-11-18T09:30:00+00:00", sha256: approved.image_sha256 };
    expect((await fromMock("POST", `/drafts/${approved.id}/posted`, post)).status, "a new post").toBe(201);
    expect((await fromMock("POST", `/drafts/${approved.id}/posted`, post)).status, "the same post again").toBe(200);
    expect((await fromMock("POST", `/drafts/${approved.id}/posted`, { ...post, sha256: "0".repeat(64) })).status, "another image").toBe(409);
    expect((await fromMock("POST", `/drafts/${approved.id}/posted`, { ...post, at: "2026-11-18T09:30:00" })).status, "no time zone").toBe(422);
    expect((await fromMock("POST", `/drafts/${approved.id}/posted`, { ...post, url: "ftp://x" })).status, "not http(s)").toBe(422);
    const after = (await fromMock("GET", "/posts/ready")).body as ReadyTeasers;
    expect(after.items.find((i) => i.id === approved.id)).toMatchObject({ posted: true });
    const detail = (await fromMock("GET", `/drafts/${approved.id}`)).body as DraftDetail;
    expect(detail.posts?.filter((p) => p.where === "parity")).toHaveLength(1);
  });
});
