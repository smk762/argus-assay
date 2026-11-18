/**
 * Teaser projects (argus-mint wire 1.11, docs/mint/docs/projects.md): the shapes of each file kind's
 * `doc`, and the pure helpers the project pages and editors use. The wire sends a file's `doc` as a
 * plain object, so its fields are written out here from argus-mint's `projects.py`.
 *
 * Nothing here works out a status, a verdict or whether anything is ready: those come from argus-mint
 * (`status` on each file, `checks` on the project). These helpers only group, label and look up what it
 * sent, and build the body of a save from an editor's fields.
 */
import type { ProjectChecks, ProjectDetail, ProjectFile, Ref, TextCheck } from "./types";

export type ProjectKind = ProjectFile["kind"];

/** The kinds in the order the page shows them, with their names. */
export const PROJECT_KINDS: readonly { kind: ProjectKind; title: string; one: string }[] = [
  { kind: "project", title: "Project", one: "project" },
  { kind: "identity", title: "Identities", one: "identity" },
  { kind: "scene", title: "Scenes", one: "scene" },
  { kind: "line", title: "Lines", one: "line" },
  { kind: "teasers", title: "Teaser links", one: "teaser links" },
];

/** Kinds whose id is the project's own (one `project.yaml`; `teasers/<project>-v<n>.json`). */
export const OWN_ID: readonly ProjectKind[] = ["project", "teasers"];

/** An id argus-mint accepts for a project or a file in it. */
export const ID_PATTERN = "[a-z0-9][a-z0-9\\-]{0,63}";
export const isId = (s: string): boolean => new RegExp(`^${ID_PATTERN}$`).test(s);

export const PRESENCE = ["embodied", "viewpoint"] as const;
export type Presence = (typeof PRESENCE)[number];
export const PRESENCE_TEXT: Record<Presence, string> = {
  embodied: "Embodied: painted into the scene from its prompt",
  viewpoint: "Viewpoint: nobody painted in; the image is what they see, through their frame",
};

/** argus-cortex's provenance kinds (`Provenance.kind`), as argus-mint checks a reference with them (wire 1.15). */
export const PROVENANCE = ["synthetic", "stock", "consented", "personal", "curated"] as const;
export type ProvenanceKind = (typeof PROVENANCE)[number];
/** What each kind is, in cortex's words. Which kinds can be approved is argus-mint's to say (its problems). */
export const PROVENANCE_TEXT: Record<ProvenanceKind, string> = {
  synthetic: "Synthetic: generated, with no real person going in",
  stock: "Stock: a published asset under its licence",
  consented: "Consented: a real person's likeness under a signed release",
  personal: "Personal: the user's own use only",
  curated: "Curated (reserved)",
};

/** An argus-cortex `Provenance` record, as a reference carries it. */
export interface Provenance {
  kind: ProvenanceKind | string;
  source: string;
  license?: string;
  notes?: string;
  /** For a consented reference, the person as the release names them. Not shown on the page. */
  subject?: string;
  release_sha256?: string | null;
  generator?: { model?: string; seed?: number; prompt?: string; [k: string]: unknown } | null;
}

/** Written by argus-mint alone: a saved document may not carry them. */
export const REVIEW_KEYS = ["status", "approved_by", "approved_at", "guard"] as const;

/** One stored SingGuard verdict, in a file's `guard` block. */
export interface GuardVerdict {
  field: string;
  sha256: string;
  policy: string;
  passed: boolean;
  detail?: string;
  checked_at: string;
}

export interface Reviewed {
  id: string;
  version: number;
  status: ProjectFile["status"];
  approved_by?: string | null;
  approved_at?: string | null;
  guard?: GuardVerdict[];
}

export interface LoraPin {
  name: string;
  weight?: number;
  trigger_words?: string[];
}

export interface ProjectDoc extends Reviewed {
  title: string;
  attribution?: string | null;
  generated_label?: boolean;
  frames?: Ref[];
  policy?: string;
  family?: string;
  style_lora?: LoraPin | null;
}

export interface Reference {
  file: string;
  sha256: string;
  provenance: Provenance;
  held_out?: boolean;
}

export interface IdentityDoc extends Reviewed {
  project: string;
  voice: string;
  presence: Presence;
  prompt?: string;
  negative?: string;
  frame?: Ref | null;
  lora?: LoraPin | null;
  proof_run?: string | null;
  proof_export?: string | null;
  check_metric?: "identity" | "likeness" | null;
  min_score?: number | null;
  training?: IdentityTraining | null;
  references?: Reference[];
}

/** How an embodied identity's LoRA is trained (argus-mint `projects.IdentityTraining`, wire 1.14). */
export interface IdentityTraining {
  model: string;
  base_model?: string | null;
  sampling: SceneDoc["sampling"];
  width?: number;
  height?: number;
  candidates?: number;
  train?: number;
  held_out?: number;
  trigger: string;
  caption_style?: "photo" | "anime";
  max_attempts?: number;
  proof_seeds?: number;
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneDoc extends Reviewed {
  project: string;
  model: string;
  sampling: { sampler: string; scheduler: string; steps: number; cfg: number; clip_skip?: number | null; guidance?: number | null };
  width: number;
  height: number;
  prompt: string;
  negative?: string;
  backgrounds?: number;
  character_area?: Area | null;
  max_attempts?: number;
}

export interface LineDoc extends Reviewed {
  project: string;
  voice: string;
  text: string;
  published?: string | null;
  source: string;
}

export interface TeaserLink {
  line: Ref;
  identity: Ref;
  scene: Ref;
  frame: Ref;
  alt: string;
  background?: string | null;
}

export interface TeasersDoc extends Reviewed {
  project: string;
  teasers: Record<string, TeaserLink>;
}

export interface DocOf {
  project: ProjectDoc;
  identity: IdentityDoc;
  scene: SceneDoc;
  line: LineDoc;
  teasers: TeasersDoc;
}

/** A file's doc, typed by its kind. */
export const docOf = <K extends ProjectKind>(file: ProjectFile & { kind: K }): DocOf[K] => file.doc as unknown as DocOf[K];

/** The files of one kind, in the order argus-mint sent them. */
export const filesOf = (detail: ProjectDetail, kind: ProjectKind): ProjectFile[] => detail.files.filter((f) => f.kind === kind);

/** The project's own file (`project.yaml`), if argus-mint sent one. */
export const projectFile = (detail: ProjectDetail): ProjectFile | undefined => detail.files.find((f) => f.kind === "project");

/** "scene lamp-room v1": how argus-mint names a file in its checks. */
export const fileLabel = (f: { kind: ProjectKind; id: string; version: number }): string => `${f.kind} ${f.id} v${f.version}`;

/** A stable key for one file of a project. */
export const fileKey = (f: { kind: ProjectKind; id: string; version: number }): string => `${f.kind}/${f.id}/${f.version}`;

/** "lamp-room v1". */
export const refText = (r: Ref | null | undefined): string => (r ? `${r.id} v${r.version}` : "none");

/**
 * argus-mint's current SingGuard verdicts (`checks.guard`) on one file, by field. It names each text
 * "<kind> <id> v<version>: <field>"; a field with none here has no verdict that still holds.
 */
export function currentVerdicts(checks: ProjectChecks, f: { kind: ProjectKind; id: string; version: number }): Map<string, TextCheck> {
  const prefix = `${fileLabel(f)}: `;
  const out = new Map<string, TextCheck>();
  for (const c of checks.guard) if (c.field.startsWith(prefix)) out.set(c.field.slice(prefix.length), c);
  return out;
}

/** The verdicts stored in a file (its `guard` block), as argus-mint wrote them. */
export const storedVerdicts = (doc: Record<string, unknown>): GuardVerdict[] => (Array.isArray(doc.guard) ? (doc.guard as GuardVerdict[]) : []);

/**
 * A spoiler hold, as the page words it: the rule's number and nothing else. argus-mint reports holds as
 * numbers only (`checks.spoiler_rules`), so no term can reach the page.
 */
export const spoilerText = (rule: number): string => `Held by spoiler rule ${rule}`;

export const VERDICT = {
  passed: { mark: "✓", label: "Passed" },
  refused: { mark: "✕", label: "Refused" },
} as const;

/** The files of a kind as options for a reference, by id and version, as argus-mint sent them. */
export const refOptions = (detail: ProjectDetail, kind: ProjectKind): { ref: Ref; status: ProjectFile["status"] }[] =>
  filesOf(detail, kind).map((f) => ({ ref: { id: f.id, version: f.version }, status: f.status }));

export const sameRef = (a: Ref | null | undefined, b: Ref | null | undefined): boolean => Boolean(a && b && a.id === b.id && a.version === b.version);
export const refValue = (r: Ref | null | undefined): string => (r ? `${r.id}@${r.version}` : "");
export function parseRef(value: string): Ref | null {
  const at = value.lastIndexOf("@");
  if (at <= 0) return null;
  const version = Number(value.slice(at + 1));
  return Number.isInteger(version) && version >= 1 ? { id: value.slice(0, at), version } : null;
}

/** The voices the project's identities and lines already speak in: the list a line's voice is picked from. */
export function knownVoices(detail: ProjectDetail): string[] {
  const out: string[] = [];
  for (const f of detail.files) {
    const voice = (f.kind === "identity" || f.kind === "line") && typeof f.doc.voice === "string" ? f.doc.voice : null;
    if (voice && !out.includes(voice)) out.push(voice);
  }
  return out;
}

/** The voices of the project's identities: who a line can be spoken by. */
export const identityVoices = (detail: ProjectDetail): string[] => [
  ...new Set(filesOf(detail, "identity").map((f) => String(f.doc.voice ?? "")).filter(Boolean)),
];

/** The next unused version of a file id: an approved or retired file never changes, so a change is a new version. */
export function nextVersion(detail: ProjectDetail, kind: ProjectKind, id: string): number {
  const versions = filesOf(detail, kind)
    .filter((f) => f.id === id)
    .map((f) => f.version);
  return versions.length ? Math.max(...versions) + 1 : 1;
}

/**
 * Where an edit of `file` is saved: a draft is saved over itself; an approved or retired one, which
 * argus-mint never changes, as the next version of the same id.
 */
export function saveTarget(detail: ProjectDetail, file: ProjectFile): { id: string; version: number } {
  return file.status === "draft" ? { id: file.id, version: file.version } : { id: file.id, version: nextVersion(detail, file.kind, file.id) };
}

/**
 * The `doc` of a save: the editor's fields without what argus-mint writes itself (status, approval,
 * SingGuard's verdicts) or takes from the path (id, version, project). Empty optional text is left out,
 * so argus-mint applies its own default.
 */
export function saveDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if ((REVIEW_KEYS as readonly string[]).includes(k) || k === "id" || k === "version" || k === "project") continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** "T3": the next free teaser number in a set of links. */
export function nextTeaser(teasers: Record<string, unknown>): string {
  let n = 1;
  while (`T${n}` in teasers) n++;
  return `T${n}`;
}

/** Teaser numbers in order: T2 before T10. */
export const teaserOrder = (teasers: Record<string, unknown>): string[] =>
  Object.keys(teasers).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b));
