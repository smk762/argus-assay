/**
 * The data tape the static demo replays (scripts/make_tape.mjs writes it from fixture/, argus-mint's
 * recorded API responses). One JSON file holds every response; the images and fonts sit beside it
 * under the paths argus-mint's fixture uses. Pure: parsing and checks only.
 */
import type {
  BackgroundSetList,
  BioInfo,
  DraftDetail,
  FrameInfo,
  FrameLayout,
  Health,
  IdentityTrainingView,
  LibraryListing,
  ProjectDetail,
  ProjectList,
  ProjectTracker,
  SampleJob,
  TemplateInfo,
} from "./types";

export const TAPE_FORMAT = "argus-assay-tape";
export const TAPE_VERSION = 1;

export type TapeKind = "recorded" | "sample";

export interface TapeProvenance {
  /** `recorded`: a real argus-mint run with real renders, pins and chain. `sample`: the API fixture's stand-ins. */
  kind: TapeKind;
  source: string;
  mint_version: string | null;
  note: string | null;
}

/** A project's backgrounds, tracker and training views, as recorded (scripts/mock_teasers.mjs readLayers). */
export interface ProjectLayers {
  /** `GET /projects/{id}/backgrounds`. */
  backgrounds: BackgroundSetList | null;
  /** `GET /projects/{id}/tracker`, as recorded (the demo reads its drafts' stages again from the drafts as they are). */
  tracker: ProjectTracker | null;
  /** Each embodied identity's `GET …/training`, by "<identity>@<version>". */
  training: Record<string, IdentityTrainingView>;
}

export interface Tape {
  format: typeof TAPE_FORMAT;
  version: number;
  /** When argus-mint recorded the responses (the newest draft's creation time). */
  recorded_at: string;
  provenance: TapeProvenance;
  health: Health;
  templates: TemplateInfo[];
  frames: FrameInfo[];
  bios: BioInfo[];
  library: LibraryListing | null;
  /** Each draft's `GET /drafts/{id}`, oldest first. */
  drafts: DraftDetail[];
  /** Where Pillow put each draft's text (`POST /frames/…/layout`), by draft id. */
  layouts: Record<string, FrameLayout>;
  /** Each sample job's `GET /samples/{id}`, oldest first. */
  samples: SampleJob[];
  /** `GET /projects`: the teaser projects (the neutral example only). */
  projects: ProjectList;
  /** Each project's `GET /projects/{id}`, in the list's order. */
  project_details: ProjectDetail[];
  /** Each project's recorded layers (wire 1.12 on), by project id; none for a tape recorded before. */
  project_layers: Record<string, ProjectLayers>;
  /** Every image and font beside tape.json, by path. */
  files: string[];
}

function fail(problem: string): never {
  throw new Error(`The data tape is not usable: ${problem}.`);
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

/** Check tape.json enough that the page can trust its shape; throws with the first problem. */
const TAPE_PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/;

/**
 * Where a frame's files sit under the tape: `frames/<id>/<version>`. A project's own frame (`<project>/<name>`) takes
 * nested directories, as record_demo.py writes them and scripts/make_tape.mjs frameDir checks; the version (digits)
 * then a fixed name (`overlay.png`, `fonts`) keeps every path distinct. Each segment is URL-encoded for the fetch.
 */
export const frameTapeDir = (id: string, version: number): string => `frames/${id.split("/").map(encodeURIComponent).join("/")}/${version}`;

export function parseTape(raw: unknown): Tape {
  if (!isObject(raw)) fail("tape.json must be an object");
  if (raw.format !== TAPE_FORMAT) fail(`format is ${JSON.stringify(raw.format)}, not ${TAPE_FORMAT}`);
  if (raw.version !== TAPE_VERSION) fail(`version ${String(raw.version)} is not ${TAPE_VERSION}; re-make it or update the page`);
  if (typeof raw.recorded_at !== "string" || Number.isNaN(Date.parse(raw.recorded_at))) fail("recorded_at must be a date");
  const provenance = raw.provenance;
  if (!isObject(provenance) || (provenance.kind !== "recorded" && provenance.kind !== "sample")) fail("provenance.kind must be recorded or sample");
  if (!isObject(raw.health) || !isObject(raw.health.capabilities)) fail("health must carry capabilities");
  for (const key of ["templates", "frames", "bios", "drafts", "samples", "files"] as const) {
    if (!Array.isArray(raw[key])) fail(`${key} must be a list`);
  }
  if (!isObject(raw.layouts)) fail("layouts must be an object");
  // A tape recorded before argus-mint had teaser projects carries none: the pages then list none.
  raw.projects ??= { projects: [] };
  raw.project_details ??= [];
  raw.project_layers ??= {};
  if (!isObject(raw.project_layers)) fail("project_layers must be an object");
  for (const [pid, l] of Object.entries(raw.project_layers)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(pid) || !isObject(l) || !isObject(l.training)) fail(`project ${pid}'s layers are not usable`);
    if (l.backgrounds != null && !(isObject(l.backgrounds) && Array.isArray(l.backgrounds.sets))) fail(`project ${pid}'s backgrounds must be {sets: [...]}`);
    if (l.tracker != null && !(isObject(l.tracker) && Array.isArray(l.tracker.teasers))) fail(`project ${pid}'s tracker must have teasers`);
  }
  if (!isObject(raw.projects) || !Array.isArray(raw.projects.projects)) fail("projects must be {projects: [...]}");
  if (!Array.isArray(raw.project_details)) fail("project_details must be a list");
  for (const p of raw.project_details as unknown[]) {
    if (!isObject(p) || typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.id) || !Array.isArray(p.files) || !isObject(p.checks)) {
      fail("a project has no usable id, files or checks");
    }
  }
  const files = new Set(raw.files as unknown[]);
  for (const f of files) {
    // A tape path names a file under the tape, so it is allowed only in a plain form: letters, digits, `_`, `-`
    // and `.` in `/`-separated segments, never `.` or `..` alone. That shuts out absolute URLs and schemes
    // (`https:`, `javascript:`), backslashes (a URL parser reads `\` as `/`) and percent-encoded dots (`%2e%2e`).
    if (typeof f !== "string" || !TAPE_PATH.test(f) || f.split("/").some((seg) => seg === "." || seg === "..")) {
      fail(`file ${JSON.stringify(f)} is not a tape path`);
    }
  }
  for (const d of raw.drafts as unknown[]) {
    if (!isObject(d) || typeof d.id !== "string" || !/^[0-9a-f]{8,32}$/.test(d.id)) fail("a draft has no usable id");
    for (const which of ["image", "art"]) if (!files.has(`drafts/${d.id}/${which}.png`)) fail(`draft ${d.id} has no ${which}.png`);
  }
  return raw as unknown as Tape;
}
