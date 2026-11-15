/**
 * The data tape the static demo replays (scripts/make_tape.mjs writes it from fixture/, argus-mint's
 * recorded API responses). One JSON file holds every response; the images and fonts sit beside it
 * under the paths argus-mint's fixture uses. Pure: parsing and checks only.
 */
import type { BioInfo, DraftDetail, FrameInfo, FrameLayout, Health, LibraryListing, SampleJob, TemplateInfo } from "./types";

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
  /** Every image and font beside tape.json, by path. */
  files: string[];
}

function fail(problem: string): never {
  throw new Error(`The data tape is not usable: ${problem}.`);
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

/** Check tape.json enough that the page can trust its shape; throws with the first problem. */
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
  const files = new Set(raw.files as unknown[]);
  for (const f of files) {
    // Paths become URLs under the tape: no climbing out of it.
    if (typeof f !== "string" || f.startsWith("/") || f.split("/").includes("..")) fail(`file ${JSON.stringify(f)} is not a tape path`);
  }
  for (const d of raw.drafts as unknown[]) {
    if (!isObject(d) || typeof d.id !== "string" || !/^[0-9a-f]{8,32}$/.test(d.id)) fail("a draft has no usable id");
    for (const which of ["image", "art"]) if (!files.has(`drafts/${d.id}/${which}.png`)) fail(`draft ${d.id} has no ${which}.png`);
  }
  return raw as unknown as Tape;
}
