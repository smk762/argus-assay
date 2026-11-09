import { mintUrl } from "./config";
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
  TemplateInfo,
  TextEdit,
  FrameLayout,
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

export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail && typeof body.detail === "object" && "error" in body.detail) {
      return String((body.detail as { error: unknown }).error);
    }
    if (body.detail != null) return JSON.stringify(body.detail);
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${mintUrl()}${path}`);
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

async function post<T>(path: string, body: unknown, auth: boolean): Promise<T> {
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
/** `version` (the image's sha256) changes the URL when an edit redraws the card, so no stale copy is shown. */
export const draftImage = (id: string, which: "image" | "art", version = ""): string =>
  imageUrl(`/drafts/${encodeURIComponent(id)}/${which}${version ? `?v=${version.slice(0, 16)}` : ""}`);
export const sampleImage = (id: string, n: number, which: "art" | "framed"): string =>
  imageUrl(`/samples/${encodeURIComponent(id)}/${n}/${which}`);
export const frameOverlay = (id: string, version: number): string =>
  imageUrl(`/frames/${encodeURIComponent(id)}/${version}/overlay`);

export const getTemplates = (): Promise<TemplateInfo[]> => getJson("/templates");
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
export const frameFont = (id: string, version: number, font: string): string =>
  imageUrl(`/frames/${encodeURIComponent(id)}/${version}/fonts/${font.split("/").map(encodeURIComponent).join("/")}`);

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

/** A frame (any status) on existing art, as an object URL for an <img>. Revoke it when done. */
export async function previewFrame(
  id: string,
  version: number,
  art: { draft?: string; sample?: string; n?: number },
  name: string,
  bio: string | null,
  texts: Record<string, string>,
): Promise<string> {
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
