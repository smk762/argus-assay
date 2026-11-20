import { mintUrl } from "./config";
import { staticDemo, tapeBase } from "./demo";
import { DemoMint, type DemoResponse } from "./demoMint";
import { frameTapeDir, parseTape } from "./tape";
import { getToken } from "./token";
import type {
  CatalogueEntry,
  CatalogueKind,
  Capabilities,
  Challenge,
  CreateDraft,
  DraftDetail,
  DraftList,
  DraftStatus,
  BioInfo,
  FrameInfo,
  Health,
  SampleJob,
  SampleJobList,
  SampleRequest,
  TemplateCheck, TemplateInfo,
  TextEdit,
  FrameLayout,
  LibraryListing,
  ProjectDetail,
  ProjectFile,
  ProjectList,
  SavedProjectFile,
  Background,
  BackgroundSet,
  BackgroundSetList,
  IdentityTrainingView,
  ProjectTracker,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
  ) {
    super(message);
  }
}

/** A write this server said it won't do (`/health.capabilities`). Thrown before the request is sent. */
export class CapabilityRefused extends ApiError {
  constructor(capability: keyof Capabilities) {
    super(`argus-mint does not allow this here (${capability} is off)`, 403);
  }
}

/** argus-mint's error `detail` as one line: a string, `{error}`, or the JSON of anything else. */
function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "error" in detail) return String((detail as { error: unknown }).error);
  return detail != null ? JSON.stringify(detail) : null;
}

export async function readError(response: Response): Promise<string> {
  try {
    const message = detailMessage(((await response.json()) as { detail?: unknown }).detail);
    if (message) return message;
  } catch {
    // A non-JSON error body still needs a readable message.
  }
  return response.statusText || `HTTP ${response.status}`;
}

let healthMemo: Health | null = null;

/** Every write checks the last `/health` first, so a refused write never reaches the wire. */
async function requireCapability(capability: keyof Capabilities): Promise<void> {
  const health = healthMemo ?? (await getHealth());
  if (!health.capabilities[capability]) throw new CapabilityRefused(capability);
}

function headers(json: boolean, auth: boolean): HeadersInit {
  const out: Record<string, string> = {};
  if (json) out["Content-Type"] = "application/json";
  const token = auth ? getToken() : "";
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

// The static demo (lib/demo.ts): argus-mint answers from the tape, in this tab (lib/demoMint.ts).
let demoLoading: Promise<DemoMint> | null = null;

function demoMint(): Promise<DemoMint> {
  if (!demoLoading) {
    demoLoading = (async () => {
      const response = await fetch(`${tapeBase()}/tape.json`);
      if (!response.ok) throw new ApiError(`Could not read the data tape (HTTP ${response.status}).`, response.status);
      return new DemoMint(parseTape(await response.json()));
    })();
    demoLoading.catch(() => {
      demoLoading = null;
    });
  }
  return demoLoading;
}

/** The static demo's tape: what it is and when it was recorded. */
export const getDemoProvenance = async () => (await demoMint()).provenance();

function demoAnswer<T>({ status, body }: DemoResponse): T {
  if (status >= 300) throw new ApiError(detailMessage((body as { detail?: unknown } | null)?.detail) ?? `HTTP ${status}`, status);
  return body as T;
}

async function getJson<T>(path: string): Promise<T> {
  if (staticDemo()) return demoAnswer<T>((await demoMint()).get(path));
  const response = await fetch(`${mintUrl()}${path}`);
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

async function post<T>(path: string, body: unknown, auth: boolean): Promise<T> {
  if (staticDemo()) return demoAnswer<T>((await demoMint()).post(path, structuredClone(body) as Record<string, unknown>));
  const response = await fetch(`${mintUrl()}${path}`, {
    method: "POST",
    headers: headers(true, auth),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

export async function getHealth(): Promise<Health> {
  healthMemo = await getJson<Health>("/health");
  return healthMemo;
}

export const imageUrl = (path: string): string => `${mintUrl()}${path}`;
/** A file beside the static demo's tape.json, under the fixture's own paths. */
const tapeFile = (path: string): string => `${tapeBase()}/${path}`;
/** `version` (the image's sha256) changes the URL when an edit redraws the card, so no stale copy is shown. */
export const draftImage = (id: string, which: "image" | "art", version = ""): string =>
  staticDemo()
    ? tapeFile(`drafts/${encodeURIComponent(id)}/${which}.png`)
    : imageUrl(`/drafts/${encodeURIComponent(id)}/${which}${version ? `?v=${version.slice(0, 16)}` : ""}`);
export const sampleImage = (id: string, n: number, which: "art" | "framed"): string =>
  staticDemo() ? tapeFile(`samples/${encodeURIComponent(id)}/${n}-${which}.png`) : imageUrl(`/samples/${encodeURIComponent(id)}/${n}/${which}`);
export const frameOverlay = (id: string, version: number): string =>
  staticDemo() ? tapeFile(`${frameTapeDir(id, version)}/overlay.png`) : imageUrl(`/frames/${encodeURIComponent(id)}/${version}/overlay`);

export const getTemplates = (): Promise<TemplateInfo[]> => getJson("/templates");
export const getLibrary = (): Promise<LibraryListing> => getJson("/library");

/**
 * What would make darkroom refuse a template, as argus-mint finds it against darkroom's model list.
 * Only asked where `/health` says the server can check (a darkroom is configured); argus-mint
 * refuses to approve a template while `problems` isn't empty.
 */
export async function checkTemplate(id: string, version: number): Promise<TemplateCheck> {
  await requireCapability("check_templates");
  return getJson(`/templates/${encodeURIComponent(id)}/${version}/check`);
}
/** A library entry's image: the PNG, or with `thumb` a JPEG preview that wide. */
export const libraryImage = (id: string, thumb = 0): string =>
  // The tape holds one thumbnail per entry, which stands in for every size (as the mock's fixture does).
  staticDemo() ? tapeFile(`library/${encodeURIComponent(id)}.jpg`) :
  imageUrl(`/library/${encodeURIComponent(id)}/image${thumb ? `?thumb=${thumb}` : ""}`);
export const getFrames = (): Promise<FrameInfo[]> => getJson("/frames");
export const getBios = (): Promise<BioInfo[]> => getJson("/bios");

export function getDrafts(status?: DraftStatus, limit = 200): Promise<DraftList> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.set("status", status);
  return getJson(`/drafts?${query}`);
}

export const getDraft = (id: string): Promise<DraftDetail> => getJson(`/drafts/${encodeURIComponent(id)}`);
export const getSamples = (): Promise<SampleJobList> => getJson("/samples?limit=200");
export const getSample = (id: string): Promise<SampleJob> => getJson(`/samples/${encodeURIComponent(id)}`);

export async function createDraft(body: CreateDraft): Promise<DraftDetail> {
  await requireCapability("create_drafts");
  if (body.library != null) await requireCapability("library");
  return post("/drafts", body, true);
}

export async function moderatorReview(id: string, approve: boolean, by: string, note: string): Promise<DraftDetail> {
  await requireCapability("moderate");
  return post(`/drafts/${encodeURIComponent(id)}/review`, { role: "moderator", approve, by, note }, true);
}

export async function ownerChallenge(id: string, approve: boolean): Promise<Challenge> {
  await requireCapability("owner_review");
  return post(`/drafts/${encodeURIComponent(id)}/challenge`, { approve }, false);
}

export async function ownerReview(
  id: string,
  approve: boolean,
  message: string,
  signature: string,
  note: string,
): Promise<DraftDetail> {
  await requireCapability("owner_review");
  return post(`/drafts/${encodeURIComponent(id)}/review`, { role: "owner", approve, message, signature, note }, false);
}

/** The message the owner signs for exactly this edit (text and/or style). */
export async function ownerEditChallenge(id: string, edit: TextEdit): Promise<Challenge> {
  await requireCapability("edit_text");
  return post(`/drafts/${encodeURIComponent(id)}/challenge`, { action: "edit", edit }, false);
}

/** The owner's change: argus-mint redraws (bakes) the card, which then needs both approvals again. */
export async function ownerEdit(id: string, edit: TextEdit, message: string, signature: string): Promise<DraftDetail> {
  await requireCapability("edit_text");
  return post(`/drafts/${encodeURIComponent(id)}/edit`, { ...edit, message, signature }, false);
}

/** Where Pillow puts each line of `texts` in this frame: what the SVG preview draws. */
export const frameLayout = (id: string, version: number, texts: Record<string, string>): Promise<FrameLayout> =>
  post(`/frames/${encodeURIComponent(id)}/${version}/layout`, { texts }, false);

/** A font the frame names, by the path the frame gives it. */
export const frameFont = (id: string, version: number, font: string): string => {
  const fontPath = font.split("/").map(encodeURIComponent).join("/");
  return staticDemo() ? tapeFile(`${frameTapeDir(id, version)}/fonts/${fontPath}`) : imageUrl(`/frames/${encodeURIComponent(id)}/${version}/fonts/${fontPath}`);
};

export async function publishDraft(id: string, price = 0): Promise<DraftDetail> {
  await requireCapability("publish");
  return post(`/drafts/${encodeURIComponent(id)}/publish`, { price }, true);
}

export async function startSamples(body: SampleRequest): Promise<SampleJob> {
  await requireCapability("sample");
  return post("/samples", body, true);
}

const PLURAL: Record<CatalogueKind, string> = { template: "templates", frame: "frames", bio: "bios" };

export async function decide(
  kind: CatalogueKind,
  id: string,
  version: number,
  decision: "approve" | "retire",
  by: string,
): Promise<CatalogueEntry> {
  await requireCapability("review_catalogue");
  return post(`/${PLURAL[kind]}/${encodeURIComponent(id)}/${version}/review`, { decision, by }, true);
}

export const getProjects = (): Promise<ProjectList> => getJson("/projects");
export const getProject = (id: string): Promise<ProjectDetail> => getJson(`/projects/${encodeURIComponent(id)}`);

const projectFilePath = (project: string, kind: ProjectFile["kind"], item: string, version: number): string =>
  `/projects/${encodeURIComponent(project)}/files/${encodeURIComponent(kind)}/${encodeURIComponent(item)}/${version}`;

/**
 * Save a draft project file (moderator token). The only request that carries prompt text: catalogue
 * authoring, which argus-mint checks on save (schema, SingGuard under the project's policy, the private
 * spoiler list) and renders nothing from until the file is approved (CLAUDE.md rule 3).
 */
export async function saveProjectFile(
  project: string,
  kind: ProjectFile["kind"],
  item: string,
  version: number,
  doc: Record<string, unknown>,
): Promise<SavedProjectFile> {
  await requireCapability("author_catalogue");
  return post(projectFilePath(project, kind, item, version), { doc }, true);
}

/** Approve a draft project file or retire an approved one (moderator token). A refusal is argus-mint's message, as sent. */
export async function reviewProjectFile(
  project: string,
  kind: ProjectFile["kind"],
  item: string,
  version: number,
  decision: "approve" | "retire",
  by: string,
): Promise<ProjectFile> {
  await requireCapability("author_catalogue");
  return post(`${projectFilePath(project, kind, item, version)}/review`, { decision, by }, true);
}

const projectPath = (project: string): string => `/projects/${encodeURIComponent(project)}`;

/** Every background set of a project, one per scene version, with each job as argus-mint reports it. */
export const getBackgrounds = (project: string): Promise<BackgroundSetList> => getJson(`${projectPath(project)}/backgrounds`);

/** A background's PNG (in the static demo, the recording's preview of it). */
export const backgroundImage = (project: string, bg: string): string =>
  staticDemo()
    ? tapeFile(`projects/${encodeURIComponent(project)}/backgrounds/${encodeURIComponent(bg)}.png`)
    : imageUrl(`${projectPath(project)}/backgrounds/${encodeURIComponent(bg)}/image`);

/** Start a job rendering an approved scene's missing backgrounds (moderator token). argus-mint refuses (409) what can't run. */
export async function startBackgrounds(project: string, scene: string, version: number): Promise<BackgroundSet> {
  await requireCapability("backgrounds");
  return post(`${projectPath(project)}/scenes/${encodeURIComponent(scene)}/${version}/backgrounds`, {}, true);
}

/** The moderator's decision on one background, bound by argus-mint to its sha256 and made once. */
export async function reviewBackground(project: string, bg: string, decision: "approve" | "reject", by: string, note: string): Promise<Background> {
  await requireCapability("backgrounds");
  return post(`${projectPath(project)}/backgrounds/${encodeURIComponent(bg)}/review`, { decision, by, note }, true);
}

/** A teaser draft from `T<n>` of the newest approved links, for the owner's wallet `to` (moderator token). Then reviewed as a card is. */
export async function makeTeaserDraft(project: string, number: string, to: string): Promise<DraftDetail> {
  await requireCapability("teasers");
  return post(`${projectPath(project)}/teasers/${encodeURIComponent(number)}/draft`, { to }, true);
}

/**
 * Run a pending teaser's identity check again (moderator token), when argus-proof was down, say. argus-mint
 * scores the same art against the same files and records auto-moderation's checks again; it changes no image.
 */
export async function rerunIdentityCheck(id: string): Promise<DraftDetail> {
  await requireCapability("identity_check");
  await requireCapability("moderate");
  return post(`/drafts/${encodeURIComponent(id)}/identity-check`, {}, true);
}

/** Each teaser's stages and drafts, as argus-mint works them out. */
export const getTracker = (project: string): Promise<ProjectTracker> => getJson(`${projectPath(project)}/tracker`);

const trainingPath = (project: string, identity: string, version: number): string =>
  `${projectPath(project)}/identities/${encodeURIComponent(identity)}/${version}/training`;

/** An identity's training record, each step's status and the one step argus-mint allows next. */
export const getTraining = (project: string, identity: string, version: number): Promise<IdentityTrainingView> =>
  getJson(trainingPath(project, identity, version));

/** Start one training step (moderator token). The page only ever asks for argus-mint's `next`. */
export async function startTrainingStep(project: string, identity: string, version: number, step: string): Promise<IdentityTrainingView> {
  await requireCapability("identity_training");
  return post(`${trainingPath(project, identity, version)}/${encodeURIComponent(step)}`, {}, true);
}

/** A training candidate's PNG. */
export const trainingCandidate = (project: string, identity: string, version: number, n: number): string =>
  staticDemo()
    ? tapeFile(`projects/${encodeURIComponent(project)}/training/${encodeURIComponent(identity)}-v${version}/${n}.png`)
    : imageUrl(`${trainingPath(project, identity, version)}/candidates/${n}`);

/** A frame (any status) on existing art, as an object URL for an <img>. Revoke it when done. */
export async function previewFrame(
  id: string,
  version: number,
  art: { draft?: string; sample?: string; n?: number },
  name: string,
  bio: string | null,
  texts: Record<string, string>,
): Promise<string> {
  if (staticDemo()) throw new ApiError("The frame preview is drawn by a running argus-mint; it is not in this demo.", 503);
  const response = await fetch(`${mintUrl()}/frames/${encodeURIComponent(id)}/${version}/preview`, {
    method: "POST",
    headers: headers(true, false),
    body: JSON.stringify({ art, name, bio, texts }),
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return URL.createObjectURL(await response.blob());
}

/** For tests: forget the memoised `/health`. */
export function resetHealthMemo(health: Health | null = null): void {
  healthMemo = health;
}
