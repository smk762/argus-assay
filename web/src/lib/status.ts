import type { CatalogueStatus, DraftStatus, Health, LoraChoice, LoraOption, SampleJob, Sampling } from "./types";

export type Tone = "ok" | "warning" | "error" | "muted" | "info";

/** A status always has a mark and a word as well as a colour. */
export const DRAFT_STATUS: Record<DraftStatus, { label: string; mark: string; tone: Tone }> = {
  pending: { label: "Pending review", mark: "…", tone: "warning" },
  approved: { label: "Approved", mark: "✓", tone: "ok" },
  rejected: { label: "Rejected", mark: "✕", tone: "error" },
  published: { label: "Published", mark: "◆", tone: "info" },
};

export const CATALOGUE_STATUS: Record<CatalogueStatus, { label: string; mark: string; tone: Tone }> = {
  draft: { label: "Draft", mark: "…", tone: "warning" },
  approved: { label: "Approved", mark: "✓", tone: "ok" },
  retired: { label: "Retired", mark: "–", tone: "muted" },
};

export const SAMPLE_STATUS: Record<SampleJob["status"], { label: string; mark: string; tone: Tone }> = {
  queued: { label: "Queued", mark: "…", tone: "muted" },
  running: { label: "Running", mark: "▶", tone: "info" },
  done: { label: "Done", mark: "✓", tone: "ok" },
  failed: { label: "Failed", mark: "✕", tone: "error" },
};

/** "✓ Approved": a status as plain text (an <option>, a caption), still with its mark and word (rule 7). */
export const statusText = (s: { label: string; mark: string }): string => `${s.mark} ${s.label}`;

const ROLE_LABEL: Record<string, string> = { moderator: "the moderator", owner: "the owner" };

/** "Waiting for the moderator and the owner", from the server's `awaiting`. */
export function awaitingText(awaiting: string[]): string {
  if (awaiting.length === 0) return "";
  return `Waiting for ${awaiting.map((role) => ROLE_LABEL[role] ?? role).join(" and ")}`;
}

/** The moderator can decide when the draft is pending and they haven't yet. */
export const moderatorCanReview = (status: DraftStatus, awaiting: string[]): boolean =>
  status === "pending" && awaiting.includes("moderator");

export const ownerCanReview = (status: DraftStatus, awaiting: string[]): boolean =>
  status === "pending" && awaiting.includes("owner");

export const canPublish = (status: DraftStatus, health: Health | null): boolean =>
  status === "approved" && Boolean(health?.capabilities.publish);

/** Which catalogue decision applies: a draft can be approved, an approved file retired. */
export function catalogueAction(status: CatalogueStatus): "approve" | "retire" | null {
  if (status === "draft") return "approve";
  if (status === "approved") return "retire";
  return null;
}

/** Whether this build understands the server's wire version. */
export const wireCompatible = (version: string, major: string): boolean => version.split(".", 1)[0] === major;

export function shortHash(hash: string, chars = 10): string {
  const body = hash.startsWith("0x") ? hash.slice(2) : hash;
  return body.length > chars ? `${hash.startsWith("0x") ? "0x" : ""}${body.slice(0, chars)}…` : hash;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** The reviewer argus-mint records when its platform checks approve for the moderator. */
export const AUTO_REVIEWER = "auto: platform checks";
export const isAutoReview = (by: string): boolean => by.startsWith("auto:");

/** Only what changed goes in an edit: unchanged fields are left out (argus-mint leaves them as they are). */
export function diffEdit(
  current: { name: string; bio: string | null; texts: Record<string, string> },
  next: { name: string; bio: string | null; texts: Record<string, string> },
): { name?: string; bio?: string; texts?: Record<string, string> } | null {
  const edit: { name?: string; bio?: string; texts?: Record<string, string> } = {};
  if (next.name.trim() && next.name.trim() !== current.name) edit.name = next.name.trim();
  if (current.bio !== null && next.bio !== null && next.bio.trim().replace(/\s+/g, " ") !== current.bio) edit.bio = next.bio.trim();
  const texts: Record<string, string> = {};
  for (const slot of new Set([...Object.keys(current.texts), ...Object.keys(next.texts)])) {
    const before = current.texts[slot] ?? "";
    const after = (next.texts[slot] ?? "").trim();
    if (before !== after) texts[slot] = after;
  }
  if (Object.keys(texts).length) edit.texts = texts;
  return Object.keys(edit).length ? edit : null;
}

/** "sdxl/juggernautXL_ragnarokBy/juggernautXL_ragnarokBy.safetensors" -> "juggernautXL_ragnarokBy". */
export function checkpointName(model: string): string {
  const file = model.split("/").pop() ?? model;
  return file.replace(/\.(safetensors|ckpt|pt)$/i, "");
}

/** Where a new draft's art can come from on this server: a render needs darkroom, the library has to be served. */
export function draftSources(health: Health | null): { render: boolean; library: boolean } {
  return { render: Boolean(health?.backends.darkroom), library: Boolean(health?.capabilities.library) };
}

/** The checkpoints a template allows: its default first, then its reviewed alternatives. */
export function allowedModels(t: { model: string; models?: string[] }): string[] {
  return [t.model, ...(t.models ?? []).filter((m) => m !== t.model)];
}

/** A relative path with "." and ".." resolved and repeated slashes collapsed, like Python's posixpath.normpath. */
function normPath(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else if (part !== ".." || !path.startsWith("/")) out.push(part);
  }
  return (path.startsWith("/") ? "/" : "") + out.join("/");
}

/**
 * A checkpoint's family: its top folder ("sdxl", "flux"…), as argus-mint's `templates.family()` and
 * darkroom name it. The path is normalised first, so "sdxl/../flux/f" is in "flux". "" at the top.
 */
export function modelFamily(model: string): string {
  const path = normPath(model);
  const cut = path.indexOf("/");
  return cut > 0 ? path.slice(0, cut) : "";
}

/** The sampling a checkpoint renders with: its own, else its family's, else the template's (`Template.sampling_for`). */
export function samplingFor(
  t: { sampling?: Sampling | null; sampling_by_family?: Record<string, Sampling>; sampling_by_model?: Record<string, Sampling> },
  model: string,
): Sampling | null {
  return t.sampling_by_model?.[model] ?? t.sampling_by_family?.[modelFamily(model)] ?? t.sampling ?? null;
}

/** Checkpoints grouped by family, families and checkpoints in the order given. */
export function byFamily(models: string[]): { family: string; models: string[] }[] {
  const groups: { family: string; models: string[] }[] = [];
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.find((g) => g.family === family);
    if (group) group.models.push(model);
    else groups.push({ family, models: [model] });
  }
  return groups;
}

type LoraRules = { lora_options?: LoraOption[]; max_loras?: number };

/** The LoRAs a card may add on this checkpoint: the template's reviewed options that pair with it. */
export function loraOptions(t: LoraRules, model: string): LoraOption[] {
  return (t.lora_options ?? []).filter((o) => !o.models?.length || o.models.includes(model));
}

/** An option's allowed weights; the first is the one argus-mint uses when none is given. */
export const loraWeights = (o: LoraOption): number[] => (o.weights?.length ? o.weights : [1]);

/**
 * What to send as `loras`, from the picks (name -> weight): only options that pair with this
 * checkpoint, at an allowed weight, and no more than `max_loras`. argus-mint refuses anything else.
 */
export function loraChoices(picked: Record<string, number>, t: LoraRules, model: string): LoraChoice[] {
  return loraOptions(t, model)
    .filter((o) => o.name in picked)
    .slice(0, t.max_loras ?? 1)
    .map((o) => ({ name: o.name, weight: loraWeights(o).includes(picked[o.name]) ? picked[o.name] : loraWeights(o)[0] }));
}

/** "DetailXL @ 0.8, Painterly @ 1" for a record's LoRAs. */
export const loraText = (loras: { name: string; weight?: number | null }[]): string =>
  loras.map((l) => `${checkpointName(l.name)} @ ${l.weight ?? 1}`).join(", ");

/** "Sampling: euler / simple, 4 steps…" for the checkpoint picked, or undefined when the template sets none. */
export function samplingHint(t: Parameters<typeof samplingFor>[0], model: string): string | undefined {
  const s = samplingFor(t, model);
  return s ? `Sampling: ${samplingText(s)}` : undefined;
}

/** "euler / normal, 28 steps, cfg 6, clip skip 2, guidance 3.5". */
export function samplingText(s: Sampling): string {
  const parts = [`${s.sampler} / ${s.scheduler}`, `${s.steps} steps`, `cfg ${s.cfg}`];
  if (s.clip_skip && s.clip_skip > 1) parts.push(`clip skip ${s.clip_skip}`);
  if (s.guidance != null) parts.push(`guidance ${s.guidance}`);
  return parts.join(", ");
}

/**
 * The draft's "made with" line, read from its own record (`made_with`, wire 1.9), never from /health,
 * which reports the server running now. `mint` is null for a draft made before argus-mint recorded it.
 */
export function madeWith(draft: {
  made_with?: Record<string, string>;
  renderer: string;
  library?: string | null;
  request: { template_id: string; template_version: number; seed: number };
}): { mint: string | null; via: string; template: string; seed: number } {
  const darkroom = draft.made_with?.darkroom;
  const via = draft.library
    ? "from the library (rendered earlier through darkroom)"
    : draft.renderer === "darkroom"
      ? `via darkroom${darkroom ? ` ${darkroom}` : ""}`
      : `with ${draft.renderer} art`;
  return {
    mint: draft.made_with?.["argus-mint"] ?? null,
    via,
    template: `${draft.request.template_id} v${draft.request.template_version}`,
    seed: draft.request.seed,
  };
}
