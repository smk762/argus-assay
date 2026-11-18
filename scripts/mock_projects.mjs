// Teaser projects for the stand-in argus-mint (scripts/mock_mint.mjs): `GET /projects`, `GET /projects/{id}`,
// and the moderator's saves and reviews of project files, kept in memory until the mock restarts. A port of
// argus-mint's server_projects.py and projects.py (docs/mint/docs/projects.md), for clicking the editors
// through without a server:
//   - a project read from fixture/ is served exactly as recorded until something in it is written; after
//     that its checks are worked out here, as argus-mint would
//   - there is no darkroom behind the mock, so SingGuard judges nothing: a save stores no verdict, and a file
//     whose texts lack a verdict that still holds can't be approved (argus-mint's answer with no darkroom)
//   - there is no spoiler list, so nothing is held
//   - a file's hash is a stand-in (sha256, not argus-mint's keccak256 of the canonical JSON)
// The schema checks cover the fields the editors write; argus-mint's are the authority.
// The hosted demo's lib/demoMint.ts serves the same projects read-only (parity.test.ts).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TEASER = /^T[1-9][0-9]{0,4}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const REVIEW_KEYS = ["status", "approved_by", "approved_at", "guard"];
const KINDS = {
  project: { subdir: null, ext: "yaml" },
  identity: { subdir: "identities", ext: "yaml" },
  scene: { subdir: "scenes", ext: "yaml" },
  line: { subdir: "lines", ext: "yaml" },
  teasers: { subdir: "teasers", ext: "json" },
};
const ORDER = Object.keys(KINDS);
const OWN_ID = ["project", "teasers"];

// The fields each kind has, in argus-mint's order, with its defaults (a saved file is returned in full).
const FIELDS = {
  project: { title: undefined, attribution: null, generated_label: true, frames: [], policy: "default", family: "sdxl", style_lora: null },
  identity: { project: undefined, voice: undefined, presence: undefined, prompt: "", negative: "", frame: null, lora: null, proof_run: null, references: [] },
  scene: {
    project: undefined, model: undefined, sampling: undefined, width: undefined, height: undefined, prompt: undefined, negative: "",
    backgrounds: 3, character_area: null, max_attempts: 4,
  },
  line: { project: undefined, voice: undefined, text: undefined, published: null, source: undefined },
  teasers: { project: undefined, teasers: {} },
};

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const repr = (v) => (typeof v === "string" ? `'${v}'` : JSON.stringify(v));
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const str = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;
const int = (v, min, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isRef = (r) => isObj(r) && ID.test(r.id ?? "") && int(r.version, 1) && Object.keys(r).every((k) => k === "id" || k === "version");
const sameRef = (a, b) => Boolean(a && b && a.id === b.id && a.version === b.version);
const refKey = (r) => `${r.id}@${r.version}`;
/** A checkpoint's family: its top folder ("sdxl", "flux"), as argus-mint's templates.family(). */
const family = (model) => (model.includes("/") ? model.split("/")[0] : "");

/** What is wrong with one file on its own (argus-mint's pydantic models), or null. */
function invalid(kind, d) {
  const extra = Object.keys(d).filter((k) => !["id", "version", ...REVIEW_KEYS, ...Object.keys(FIELDS[kind])].includes(k));
  if (extra.length) return `extra fields not permitted: ${extra.join(", ")}`;
  const missing = Object.entries(FIELDS[kind]).filter(([k, def]) => def === undefined && d[k] === undefined).map(([k]) => k);
  if (missing.length) return `field required: ${missing.join(", ")}`;
  if (kind !== "project" && !ID.test(d.project)) return "project must be an id";
  if (kind === "project") {
    if (!str(d.title, 1, 120)) return "title is 1 to 120 characters";
    if (d.attribution !== null && !str(d.attribution, 0, 120)) return "attribution is up to 120 characters, or null";
    if (typeof d.generated_label !== "boolean") return "generated_label is true or false";
    if (!Array.isArray(d.frames) || !d.frames.every(isRef)) return "frames are {id, version}";
    if (!str(d.policy, 1, 64) || !str(d.family, 1, 32)) return "policy and family are names";
  }
  if (kind === "identity") {
    if (!str(d.voice, 1, 32)) return "voice is 1 to 32 characters";
    if (!["embodied", "viewpoint"].includes(d.presence)) return "presence is embodied or viewpoint";
    if (!str(d.prompt, 0, 2000) || !str(d.negative, 0, 2000)) return "prompt and negative are up to 2000 characters";
    if (/[{}]/.test(d.prompt)) return "an identity's prompt is fixed text: no placeholders or braces";
    if (d.frame !== null && !isRef(d.frame)) return "frame is {id, version}";
    if (d.presence === "embodied" && !d.prompt.trim()) return "an embodied identity needs a prompt describing them";
    if (d.presence === "embodied" && d.frame !== null) return "an embodied identity has no frame of its own (the teaser names one)";
    if (d.presence === "viewpoint" && d.frame === null) return "a viewpoint identity needs its frame";
    if (d.presence === "viewpoint" && d.lora !== null) return "a viewpoint identity isn't painted in, so it takes no LoRA";
    if ((d.lora === null) !== (d.proof_run === null)) return "a LoRA and the proof run that passed it go together";
    if (!Array.isArray(d.references)) return "references are a list";
    for (const r of d.references) {
      if (!isObj(r) || !str(r.file, 1, Infinity) || !HEX64.test(r.sha256 ?? "")) return "a reference has a file and its sha256";
      if (!["generated", "licensed", "personal"].includes(r.provenance)) return "a reference's provenance is generated, licensed or personal";
      if (r.provenance === "personal" && !r.consent) return `reference ${r.file}: a personal photo needs a consent record (\`consent\`)`;
    }
    if (new Set(d.references.map((r) => r.file)).size !== d.references.length) return "a reference is listed twice";
  }
  if (kind === "scene") {
    const s = d.sampling;
    if (!isObj(s) || !str(s.sampler, 1, 64) || !str(s.scheduler, 1, 64) || !int(s.steps, 1) || typeof s.cfg !== "number") return "sampling needs sampler, scheduler, steps and cfg";
    if (!str(d.model, 1, Infinity)) return "model is a checkpoint";
    if (!int(d.width, 1, 8192) || !int(d.height, 1, 8192)) return "width and height are 1 to 8192";
    if (!str(d.prompt, 1, 2000) || !str(d.negative, 0, 2000)) return "prompt is 1 to 2000 characters, negative up to 2000";
    if (/[{}]/.test(d.prompt + d.negative)) return "a scene's prompt is fixed text: no placeholders or braces";
    if (!int(d.backgrounds, 1, 12) || !int(d.max_attempts, 1, 16)) return "backgrounds is 1 to 12, max_attempts 1 to 16";
    const a = d.character_area;
    if (a !== null && !(isObj(a) && int(a.x, 0) && int(a.y, 0) && int(a.width, 1) && int(a.height, 1))) return "character_area is x, y, width and height";
    if (a && (a.x + a.width > d.width || a.y + a.height > d.height))
      return `character_area ${a.x},${a.y} ${a.width}x${a.height} falls outside ${d.width}x${d.height}`;
  }
  if (kind === "line") {
    if (!str(d.voice, 1, 32)) return "voice is 1 to 32 characters";
    if (!str(d.text, 1, 600)) return "text is 1 to 600 characters";
    if (d.published !== null && !str(d.published, 1, 600)) return "published is 1 to 600 characters, or null";
    if (!str(d.source, 1, 200)) return "source is 1 to 200 characters";
  }
  if (kind === "teasers") {
    if (d.id !== d.project) return `teaser links take their project's id (${d.project}), not '${d.id}'`;
    if (!isObj(d.teasers)) return "teasers is an object";
    const bad = Object.keys(d.teasers).filter((k) => !TEASER.test(k));
    if (bad.length) return `teaser numbers are T1, T2…: ${bad.join(", ")}`;
    for (const t of Object.values(d.teasers)) {
      if (!isObj(t) || !["line", "identity", "scene", "frame"].every((k) => isRef(t[k]))) return "a teaser names its line, identity, scene and frame by {id, version}";
      if (!str(t.alt, 1, 1000)) return "a teaser's alt text is 1 to 1000 characters";
      if (t.background != null && !str(t.background, 1, 64)) return "background is a render's id";
    }
  }
  return null;
}

/** (field, text) for each text SingGuard reads in a file (negative prompts are left out). */
function guardedTexts(kind, d) {
  if (kind === "teasers") return Object.entries(d.teasers).map(([n, t]) => [`${n}.alt`, t.alt]);
  const fields = { project: ["title", "attribution"], identity: ["prompt"], scene: ["prompt"], line: ["text", "published"] }[kind];
  return fields.filter((f) => typeof d[f] === "string" && d[f].trim()).map((f) => [f, d[f]]);
}

/** The stored verdicts that still hold (same text, same policy), by field, and the texts with none. */
function freshVerdicts(kind, d, policy) {
  const fresh = new Map();
  const missing = [];
  for (const [f, text] of guardedTexts(kind, d)) {
    const v = (d.guard ?? []).find((g) => g.field === f && g.sha256 === sha256(text) && g.policy === policy);
    if (v) fresh.set(f, v);
    else missing.push([f, text]);
  }
  return { fresh, missing };
}

const fileName = (f) => f.file.split("/").pop();
const docOrder = (kind, d) => {
  const out = { id: d.id, version: d.version, status: d.status, approved_by: d.approved_by ?? null, approved_at: d.approved_at ?? null };
  if (d.guard?.length) out.guard = d.guard;
  for (const k of Object.keys(FIELDS[kind])) out[k] = d[k];
  return out;
};
const hashOf = (d) => {
  const { status: _s, guard: _g, ...rest } = d;
  return `0x${sha256(JSON.stringify(rest, Object.keys(rest).sort()))}`;
};

export class MockProjects {
  /** `fixtureDir`: fixture/ (projects.json and projects/<id>.json, when recorded); `frames`: the fixture's frames.json. */
  constructor(fixtureDir, frames, { today = () => new Date().toISOString().slice(0, 10) } = {}) {
    this.frames = new Set(frames.map((f) => refKey(f.frame)));
    this.today = today;
    this.projects = new Map(); // id -> { files: [...ProjectFile], recorded: detail | null }
    const list = existsSync(join(fixtureDir, "projects.json")) ? JSON.parse(readFileSync(join(fixtureDir, "projects.json"), "utf8")).projects : [];
    for (const p of list) {
      const detail = JSON.parse(readFileSync(join(fixtureDir, "projects", `${p.id}.json`), "utf8"));
      this.projects.set(p.id, { files: structuredClone(detail.files), recorded: detail });
    }
  }

  table(pid, kind) {
    return this.projects.get(pid).files.filter((f) => f.kind === kind);
  }

  find(pid, kind, id, version) {
    return this.projects.get(pid)?.files.find((f) => f.kind === kind && f.id === id && f.version === version);
  }

  policy(pid) {
    return this.table(pid, "project")[0]?.doc.policy ?? "default";
  }

  teaserProblems(pid, links) {
    const out = [];
    const project = this.table(pid, "project")[0].doc;
    if (links.project !== pid) out.push(`the teaser links are for project '${links.project}', not '${pid}'`);
    const allowed = new Set(project.frames.map(refKey));
    for (const [n, t] of Object.entries(links.teasers)) {
      const line = this.find(pid, "line", t.line.id, t.line.version)?.doc;
      const ident = this.find(pid, "identity", t.identity.id, t.identity.version)?.doc;
      const scene = this.find(pid, "scene", t.scene.id, t.scene.version)?.doc;
      if (!line) out.push(`${n}: no line ${t.line.id} v${t.line.version}`);
      if (!ident) out.push(`${n}: no identity ${t.identity.id} v${t.identity.version}`);
      if (!scene) out.push(`${n}: no scene ${t.scene.id} v${t.scene.version}`);
      if (allowed.size && !allowed.has(refKey(t.frame))) out.push(`${n}: frame ${t.frame.id} v${t.frame.version} isn't one of the project's frames`);
      if (line && ident && line.voice !== ident.voice) out.push(`${n}: the line is in the ${repr(line.voice)} voice but the identity speaks as ${repr(ident.voice)}`);
      if (ident && scene) {
        if (ident.presence === "embodied" && scene.character_area == null)
          out.push(`${n}: ${ident.id} appears in the image, but scene ${scene.id} has no character_area`);
        if (ident.presence === "viewpoint" && !sameRef(t.frame, ident.frame)) out.push(`${n}: a viewpoint teaser uses its identity's frame (${ident.frame.id})`);
      }
    }
    return out;
  }

  problems(pid) {
    const out = [];
    const project = this.table(pid, "project")[0].doc;
    if (project.id !== pid) out.push(`project.yaml says id ${repr(project.id)}, but the directory is ${repr(pid)}`);
    for (const fr of project.frames) if (!this.frames.has(refKey(fr))) out.push(`project.yaml names frame ${fr.id} v${fr.version}, which this server doesn't have`);
    for (const kind of ["identity", "scene", "line"]) {
      for (const f of this.table(pid, kind)) if (f.doc.project !== pid) out.push(`${fileName(f)}: ${kind} ${f.id} belongs to project ${repr(f.doc.project)}, not ${repr(pid)}`);
    }
    for (const f of this.table(pid, "identity")) {
      const fr = f.doc.frame;
      if (fr && !this.frames.has(refKey(fr))) out.push(`${fileName(f)}: frame ${fr.id} v${fr.version} doesn't exist`);
    }
    for (const f of this.table(pid, "scene")) {
      if (family(f.doc.model) !== project.family) out.push(`${fileName(f)}: checkpoint ${f.doc.model} isn't in the project's family ${repr(project.family)}`);
    }
    for (const f of this.table(pid, "teasers")) if (f.status !== "retired") out.push(...this.teaserProblems(pid, f.doc).map((p) => `${fileName(f)}: ${p}`));
    return out;
  }

  textChecks(pid, f) {
    const { fresh } = freshVerdicts(f.kind, f.doc, this.policy(pid));
    return [...fresh].map(([field, v]) => ({ field: `${f.kind} ${f.id} v${f.version}: ${field}`, passed: v.passed, detail: v.detail ?? "" }));
  }

  checks(pid, files) {
    return { problems: this.problems(pid), spoiler_rules: [], guard: files.flatMap((f) => this.textChecks(pid, f)), guard_ran: false };
  }

  detail(pid) {
    const p = this.projects.get(pid);
    if (p.recorded) return p.recorded;
    const files = ORDER.flatMap((kind) => this.table(pid, kind));
    return { id: pid, files, checks: this.checks(pid, files) };
  }

  touched(pid) {
    this.projects.get(pid).recorded = null;
  }

  /** `{status, body}` for a GET under /projects, or null when the path isn't one. */
  get(pathname) {
    const p = pathname.split("/").filter(Boolean);
    if (p[0] !== "projects") return null;
    if (p.length === 1) {
      const projects = [...this.projects.keys()].sort().map((id) => {
        const doc = this.table(id, "project")[0].doc;
        return { id, title: doc.title, status: doc.status };
      });
      return { status: 200, body: { projects } };
    }
    if (p.length === 2) return this.projects.has(p[1]) ? { status: 200, body: this.detail(p[1]) } : { status: 404, body: { detail: `no project ${p[1]}` } };
    return null;
  }

  /** `{status, body}` for a POST under /projects, or null when the path isn't one. */
  post(pathname, b) {
    const p = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (p[0] !== "projects" || p[2] !== "files" || p.length < 6) return null;
    const [pid, , kind, id, v, review] = p.slice(1);
    const version = Number(v);
    const fail = (status, detail) => ({ status, body: { detail } });
    if (!(kind in KINDS)) return fail(404, `no project file kind '${kind}'`);
    if (!ID.test(pid)) return fail(404, `no project '${pid}'`);
    if (review === "review" && p.length === 7) return this.review(pid, kind, id, version, b, fail);
    if (p.length !== 6) return null;
    return this.save(pid, kind, id, version, b, fail);
  }

  save(pid, kind, id, version, b, fail) {
    if (!ID.test(id) || !Number.isInteger(version) || version < 1) return fail(422, "an id is lower-case letters, digits and hyphens, and a version is 1 or more");
    if (OWN_ID.includes(kind) && id !== pid) return fail(422, `a ${kind} file's id is the project's own (${pid})`);
    if (!isObj(b) || !isObj(b.doc)) return fail(422, "the body is {doc}");
    const given = REVIEW_KEYS.filter((k) => k in b.doc);
    if (given.length) return fail(422, `a saved file is a draft, checked here: leave out ${given.join(", ")}`);
    for (const [key, want] of [["id", id], ["version", version], ...(kind !== "project" ? [["project", pid]] : [])]) {
      if (key in b.doc && b.doc[key] !== want) return fail(422, `\`${key}\` is ${repr(b.doc[key])} in the file but ${repr(want)} in the path`);
    }
    const doc = { id, version, status: "draft", ...(kind !== "project" ? { project: pid } : {}) };
    for (const [k, value] of Object.entries(b.doc)) if (!(k in doc)) doc[k] = value;
    for (const [k, def] of Object.entries(FIELDS[kind])) if (doc[k] === undefined && def !== undefined) doc[k] = structuredClone(def);
    const problem = invalid(kind, doc);
    if (problem) return fail(422, `${kind} ${id} v${version}: ${problem}`);
    if (kind !== "project" && !this.projects.has(pid)) return fail(404, `no project ${pid}: save its project.yaml first`);
    const existing = this.find(pid, kind, id, version);
    if (existing && existing.status !== "draft") return fail(409, `${kind} ${id} v${version} is ${existing.status}; save a new version`);
    // No darkroom here: SingGuard judges nothing, so the saved file holds no verdict.
    const saved = docOrder(kind, { ...doc, approved_by: null, approved_at: null, guard: [] });
    if (!this.projects.has(pid)) this.projects.set(pid, { files: [], recorded: null });
    const project = this.projects.get(pid);
    const file =
      existing?.file ?? (KINDS[kind].subdir ? `${KINDS[kind].subdir}/${id}-v${version}.${KINDS[kind].ext}` : "project.yaml");
    const entry = { kind, id, version, status: "draft", hash: hashOf(saved), file, doc: saved };
    // One project.yaml per project: saving the project again replaces it, as the file on argus-mint's disk is.
    project.files = project.files.filter((f) => !(f.kind === kind && (kind === "project" || (f.id === id && f.version === version))));
    project.files.push(entry);
    project.files.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind) || x.file.localeCompare(y.file));
    this.touched(pid);
    return { status: 200, body: { file: structuredClone(entry), checks: this.checks(pid, [entry]) } };
  }

  review(pid, kind, id, version, b, fail) {
    if (!this.projects.has(pid)) return fail(404, `no project ${pid}`);
    const f = this.find(pid, kind, id, version);
    if (!f) return fail(404, `no ${kind} ${id} v${version} in project ${pid}`);
    if (!isObj(b) || (b.decision !== "approve" && b.decision !== "retire") || !str(b.by, 1, 128))
      return fail(422, 'the body is {decision: "approve" or "retire", by}');
    const by = b.by.trim();
    if (b.decision === "approve") {
      if (kind === "teasers") {
        const wrong = this.teaserProblems(pid, f.doc);
        if (wrong.length) return fail(409, `the teaser links have problems: ${wrong.join("; ")}`);
        const unapproved = new Set();
        for (const t of Object.values(f.doc.teasers)) {
          for (const k of ["line", "identity", "scene"]) if (this.find(pid, k, t[k].id, t[k].version)?.status !== "approved") unapproved.add(`${k} ${t[k].id} v${t[k].version}`);
        }
        if (unapproved.size) return fail(409, `teasers link files that aren't approved: ${[...unapproved].sort().join(", ")}`);
      }
      const policy = kind === "project" ? f.doc.policy : this.policy(pid);
      if (freshVerdicts(kind, f.doc, policy).missing.length) return fail(409, "no darkroom is configured, so SingGuard can't check this text and it can't be approved");
      const failed = this.textChecks(pid, f).filter((c) => !c.passed);
      if (failed.length) return fail(409, `SingGuard refused: ${failed.map((c) => `${c.field} (${c.detail})`).join("; ")}`);
      if (f.status !== "draft") return fail(409, `only a draft can be approved; this one is ${f.status}`);
    } else if (f.status !== "approved") return fail(409, `only an approved file can be retired; this one is ${f.status}`);
    if (!by || by.includes("\n")) return fail(409, "the reviewer's name is required, on one line");
    f.status = b.decision === "approve" ? "approved" : "retired";
    f.doc.status = f.status;
    if (b.decision === "approve") Object.assign(f.doc, { approved_by: by, approved_at: this.today() });
    this.touched(pid);
    return { status: 200, body: structuredClone(f) };
  }
}
