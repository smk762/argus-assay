// A teaser's layers for the stand-in argus-mint (scripts/mock_mint.mjs): backgrounds, teaser drafts, the
// tracker, posting, the identity check and identity training (argus-mint server_teasers.py, server_posts.py,
// server_training.py; docs/mint/docs/projects.md). It serves what fixture/ recorded under
// projects/<id>/ (backgrounds.json and each PNG, tracker.json, training/<identity>-v<n>.json):
//   - a background review sticks until the mock restarts; a job can't start (no darkroom behind the mock)
//   - a teaser draft is a copy of the newest recorded draft of that number (nothing renders here), pending
//   - the tracker is the recorded one with each teaser's drafts and draft-based stages read from the drafts
//     as they are now (reviews, posts and minting here change them, as in argus-mint)
//   - GET /posts/ready is worked out from the drafts, as argus-mint does; a post is recorded in memory
//   - no argus-proof, curator, lens or forge: the identity check and training steps answer 503
// A fixture recorded before argus-mint had these (wire 1.12) holds none of them: those reads answer 404.
// The hosted demo's lib/demoMint.ts serves the same reads (parity.test.ts) and refuses every write.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TEASER = /^T[1-9][0-9]{0,4}$/;
const WHERE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** What argus-mint says when identity training has none of its siblings (server_training.py). */
export const TRAINING_OFF =
  "identity training isn't set up here: no curator (ARGUS_MINT_CURATOR_URL), lens (ARGUS_MINT_LENS_URL), forge (ARGUS_MINT_FORGE_URL), " +
  "proof (ARGUS_MINT_PROOF_URL), the shared exports directory (ARGUS_MINT_TRAINING_EXPORTS_DIR), the shared LoRA directory " +
  "(ARGUS_MINT_LORAS_DIR), darkroom (ARGUS_MINT_DARKROOM_URL)";
export const NOT_RECORDED = (pid, what) => `${what} of project ${pid} wasn't recorded in this fixture (recorded before argus-mint had it)`;

/** Each project's recorded layers: `{backgrounds, tracker, training: {"<identity>@<v>": view}}`, by project id. */
export function readLayers(root) {
  const out = {};
  if (!existsSync(join(root, "projects.json"))) return out;
  const read = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
  for (const { id } of read("projects.json").projects) {
    const dir = join(root, "projects", id);
    const training = {};
    if (existsSync(join(dir, "training"))) {
      for (const f of readdirSync(join(dir, "training")).filter((x) => x.endsWith(".json")).sort()) {
        const view = read(`projects/${id}/training/${f}`);
        training[`${view.identity}@${view.version}`] = view;
      }
    }
    out[id] = {
      backgrounds: existsSync(join(dir, "backgrounds.json")) ? read(`projects/${id}/backgrounds.json`) : null,
      tracker: existsSync(join(dir, "tracker.json")) ? read(`projects/${id}/tracker.json`) : null,
      training,
    };
  }
  return out;
}

/** The newest approved teaser links of a project detail (argus-mint's `current_teasers`), or null. */
export function currentLinks(detail) {
  const approved = (detail?.files ?? []).filter((f) => f.kind === "teasers" && f.status === "approved");
  return approved.sort((a, b) => b.version - a.version)[0]?.doc ?? null;
}

/** argus-mint's posting.is_current: was the draft made from the line, identity and scene the links name now? */
export function isCurrent(teaser, links) {
  const link = links?.teasers?.[teaser.number];
  if (!link) return false;
  return ["line", "identity", "scene"].every((k) => link[k].id === teaser[k].id && link[k].version === teaser[k].version);
}

const newestFirst = (a, b) => (a.draft.created_at < b.draft.created_at ? 1 : a.draft.created_at > b.draft.created_at ? -1 : 0);
const teaserDrafts = (drafts, pid) => [...drafts.values()].filter((d) => d.draft.kind === "teaser" && d.draft.teaser && (!pid || d.draft.teaser.project.id === pid));

/** The recorded tracker, with each teaser's drafts and the stages argus-mint works out from drafts read from `drafts` now. */
export function trackerNow(recorded, drafts, links) {
  const out = structuredClone(recorded);
  for (const t of out.teasers) {
    const mine = teaserDrafts(drafts, out.project).filter((d) => d.draft.teaser.number === t.number).sort(newestFirst);
    t.drafts = mine.map((d) => ({
      id: d.id,
      status: d.status,
      awaiting: d.awaiting,
      created_at: d.draft.created_at,
      links_version: d.draft.teaser.links.version,
      background: d.draft.teaser.background.id,
      current: isCurrent(d.draft.teaser, links),
    }));
    t.stages = {
      ...t.stages,
      image_made: t.drafts.some((s) => s.current && (s.status === "approved" || s.status === "published")),
      posted: mine.some((d) => (d.posts ?? []).length > 0),
      minted: t.drafts.some((s) => s.status === "published"),
    };
  }
  return out;
}

/** `GET /posts/ready` from the drafts (argus-mint server_posts.py), or `{status, detail}` for a bad query. */
export function readyPosts(drafts, query, linksOf) {
  const project = query.get("project");
  const limit = Number(query.get("limit") ?? 50);
  const offset = Number(query.get("offset") ?? 0);
  if ((project !== null && !ID.test(project)) || !Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0)
    return { status: 422, detail: "project is an id, limit 1 to 200, offset 0 or more" };
  const items = teaserDrafts(drafts, project)
    .filter((d) => d.status === "approved" || d.status === "published")
    .sort(newestFirst)
    .map((d) => {
      const x = d.draft;
      const t = x.teaser;
      const approvals = (x.reviews ?? []).filter((r) => r.image_sha256 === x.image_sha256 && r.decision === "approved").map((r) => r.at);
      return {
        id: d.id,
        project: t.project.id,
        title: x.name.endsWith(` ${t.number}`) ? x.name.slice(0, -(t.number.length + 1)) : x.name,
        number: t.number,
        status: d.status,
        current: isCurrent(t, linksOf(t.project.id)),
        created_at: x.created_at,
        approved_at: approvals.sort().at(-1),
        image_url: `/drafts/${d.id}/image`,
        image_sha256: x.image_sha256,
        alt: t.alt,
        quote: x.texts?.quote ?? "",
        attribution: x.texts?.attribution ?? null,
        label: x.texts?.label ?? null,
        posted: (d.posts ?? []).length > 0,
        posts: d.posts ?? [],
      };
    });
  return { status: 200, body: { items: items.slice(offset, offset + limit), total: items.length } };
}

/** Where a GET under /projects is one of the layers': `{pid, what, ...}`, or null. */
export function layerPath(pathname) {
  const p = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (p[0] !== "projects" || p.length < 3) return null;
  const pid = p[1];
  if (p.length === 3 && p[2] === "backgrounds") return { pid, what: "backgrounds" };
  if (p.length === 3 && p[2] === "tracker") return { pid, what: "tracker" };
  if (p.length === 6 && p[2] === "scenes" && p[5] === "backgrounds") return { pid, what: "set", scene: p[3], version: Number(p[4]) };
  if (p.length === 5 && p[2] === "backgrounds" && p[4] === "image") return { pid, what: "image", bg: p[3] };
  if (p.length === 6 && p[2] === "identities" && p[5] === "training") return { pid, what: "training", identity: p[3], version: Number(p[4]) };
  if (p.length === 8 && p[2] === "identities" && p[5] === "training" && p[6] === "candidates")
    return { pid, what: "candidate", identity: p[3], version: Number(p[4]), n: Number(p[7]) };
  return null;
}

/** A read of the layers both stand-ins answer alike: `{status, body}` or null when the path isn't one. */
export function readLayer(layers, details, drafts, at) {
  const fail = (status, detail) => ({ status, body: { detail } });
  const layer = layers[at.pid];
  if (!details.some((d) => d.id === at.pid)) return fail(404, `no project '${at.pid}'`);
  if (at.what === "backgrounds") return layer?.backgrounds ? { status: 200, body: layer.backgrounds } : fail(404, NOT_RECORDED(at.pid, "the backgrounds"));
  if (at.what === "set") {
    if (!layer?.backgrounds) return fail(404, NOT_RECORDED(at.pid, "the backgrounds"));
    const set = layer.backgrounds.sets.find((s) => s.scene === at.scene && s.scene_version === at.version);
    return set ? { status: 200, body: set } : fail(404, `scene ${at.scene} v${at.version} of project ${at.pid} has no backgrounds yet`);
  }
  if (at.what === "tracker") {
    if (!layer?.tracker) return fail(404, NOT_RECORDED(at.pid, "the tracker"));
    return { status: 200, body: trackerNow(layer.tracker, drafts, currentLinks(details.find((d) => d.id === at.pid))) };
  }
  if (at.what === "training") {
    const view = layer?.training?.[`${at.identity}@${at.version}`];
    return view ? { status: 200, body: view } : fail(404, NOT_RECORDED(at.pid, `the training view of ${at.identity} v${at.version}`));
  }
  if (at.what === "candidate") return fail(404, `${at.identity} v${at.version} has no recorded candidate ${at.n}`);
  return null;
}

/** The mock's state for the layers: reads from the fixture, and the writes argus-mint takes, kept in memory. */
export class MockTeasers {
  constructor(root, drafts, images, { now = () => new Date().toISOString(), id16 = () => randomBytes(8).toString("hex") } = {}) {
    this.root = root;
    this.layers = readLayers(root);
    this.details = existsSync(join(root, "projects.json"))
      ? JSON.parse(readFileSync(join(root, "projects.json"), "utf8")).projects.map((p) => JSON.parse(readFileSync(join(root, "projects", `${p.id}.json`), "utf8")))
      : [];
    this.drafts = drafts;
    this.images = images;
    this.now = now;
    this.id16 = id16;
  }

  linksOf(pid) {
    return currentLinks(this.details.find((d) => d.id === pid));
  }

  /** `{status, body, type?}` for a GET, or null. */
  get(url) {
    if (url.pathname === "/posts/ready") {
      const r = readyPosts(this.drafts, url.searchParams, (pid) => this.linksOf(pid));
      return r.status === 200 ? r : { status: r.status, body: { detail: r.detail } };
    }
    const at = layerPath(url.pathname);
    if (!at) return null;
    if (at.what === "image") {
      const file = join(this.root, "projects", at.pid, "backgrounds", `${at.bg}.png`);
      return /^[a-z0-9-]+$/.test(at.bg) && existsSync(file)
        ? { status: 200, body: readFileSync(file), type: "image/png" }
        : { status: 404, body: { detail: `no background ${at.bg}` } };
    }
    return readLayer(this.layers, this.details, this.drafts, at);
  }

  /** `{status, body}` for a POST, or null. */
  post(pathname, b) {
    const p = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const fail = (status, detail) => ({ status, body: { detail } });
    if (p[0] === "drafts" && p.length === 3 && p[2] === "posted") return this.posted(p[1], b, fail);
    if (p[0] === "drafts" && p.length === 3 && p[2] === "identity-check") {
      const d = this.drafts.get(p[1]);
      if (!d) return fail(404, `no draft ${p[1]}`);
      return fail(503, "the mock has no argus-proof to score with (ARGUS_MINT_PROOF_URL)");
    }
    if (p[0] !== "projects" || !ID.test(p[1] ?? "")) return null;
    const pid = p[1];
    if (p.length === 6 && p[2] === "scenes" && p[5] === "backgrounds") return fail(503, "no darkroom is configured (ARGUS_MINT_DARKROOM_URL)");
    if (p.length === 5 && p[2] === "backgrounds" && p[4] === "review") return this.reviewBackground(pid, p[3], b, fail);
    if (p.length === 5 && p[2] === "teasers" && p[4] === "draft") return this.teaserDraft(pid, p[3], b, fail);
    if (p.length === 7 && p[2] === "identities" && p[5] === "training") return fail(503, TRAINING_OFF);
    return null;
  }

  reviewBackground(pid, bgId, b, fail) {
    const sets = this.layers[pid]?.backgrounds?.sets ?? [];
    const bg = sets.flatMap((s) => s.backgrounds ?? []).find((x) => x.id === bgId);
    if (!bg) return fail(404, `no background ${bgId}`);
    if (b?.decision !== "approve" && b?.decision !== "reject") return fail(422, 'decision must be "approve" or "reject"');
    if (typeof b.by !== "string" || !b.by.trim() || b.by.length > 128) return fail(422, "by is the reviewer's name");
    if (bg.review) return fail(409, `background ${bgId} was already ${bg.review.decision}`);
    const decision = b.decision === "approve" ? "approved" : "rejected";
    bg.review = { decision, by: b.by.trim(), at: this.now(), image_sha256: bg.sha256, note: String(b.note ?? "") };
    bg.status = decision;
    return { status: 200, body: structuredClone(bg) };
  }

  teaserDraft(pid, number, b, fail) {
    if (!TEASER.test(number)) return fail(404, `teasers are numbered T1, T2…, not '${number}'`);
    if (typeof b?.to !== "string" || !ADDRESS.test(b.to)) return fail(422, "to is a wallet address");
    if (!this.details.some((d) => d.id === pid)) return fail(404, `no project '${pid}'`);
    const from = teaserDrafts(this.drafts, pid).filter((d) => d.draft.teaser.number === number).sort(newestFirst)[0];
    if (!from) return fail(503, `the mock renders nothing, and the fixture has no draft of ${number} to copy`);
    const id = this.id16();
    const copy = structuredClone(from);
    Object.assign(copy, { id, status: "pending", awaiting: ["moderator", "owner"], published: null, posts: [] });
    Object.assign(copy.draft, { to: b.to, created_at: this.now(), reviews: [], edits: [] });
    this.drafts.set(id, copy);
    this.images.set(id, this.images.get(from.id));
    return { status: 201, body: structuredClone(copy) };
  }

  posted(id, b, fail) {
    const d = this.drafts.get(id);
    if (!d) return fail(404, `no draft ${id}`);
    if (!b || !WHERE.test(b.where ?? "") || !HEX64.test(b.sha256 ?? "") || typeof b.at !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(b.at) || Number.isNaN(Date.parse(b.at)))
      return fail(422, "where, at (with its time zone) and sha256 are required");
    if (b.url != null && !/^https?:\/\//.test(b.url)) return fail(422, "a post's url is an http(s) URL");
    if (d.draft.kind !== "teaser") return fail(409, "only a teaser draft is posted");
    if (d.status !== "approved" && d.status !== "published") return fail(409, `only an approved teaser is posted (this one is ${d.status})`);
    if (b.sha256 !== d.draft.image_sha256) return fail(409, "sha256 isn't this draft's image: post the reviewed PNG, byte for byte");
    d.posts ??= [];
    const url = b.url ?? null;
    const same = d.posts.some((x) => x.where === b.where && (x.url ?? null) === url && Date.parse(x.at) === Date.parse(b.at) && x.sha256 === b.sha256);
    // The mock checks no token, so it can't tell the poster's from the moderator's: it records the poster.
    if (!same) d.posts.push({ where: b.where, url, at: b.at, sha256: b.sha256, recorded_at: this.now(), by: "poster" });
    return { status: same ? 200 : 201, body: { id, image_sha256: d.draft.image_sha256, posts: structuredClone(d.posts) } };
  }
}
