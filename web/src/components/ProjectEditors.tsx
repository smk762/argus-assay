"use client";

/**
 * Catalogue authoring: the editors that save a teaser project's draft files (moderator only). This is the
 * one module allowed text fields for prompt text (CLAUDE.md rule 3, rules.test.ts "no free-text prompts"),
 * and what they hold goes to argus-mint by one call only, `saveProjectFile`. argus-mint checks every save
 * (schema, SingGuard under the project's policy, the private spoiler list) and renders nothing from a file
 * until it is approved.
 *
 * Free text is only for the authored texts: prompt, negative, a line's text and published wording, its
 * source, the title, the attribution and alt text, and a reference's provenance source, licence and (for a
 * consented one) subject. Everything else is picked from a list (presence, provenance kind, voices the project
 * already has, files by id and version, frames, checkpoints, samplers, backgrounds of the scene),
 * a number, or an identifier with argus-mint's pattern.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { saveProjectFile } from "@/lib/api";
import {
  ID_PATTERN,
  identityVoices,
  knownVoices,
  nextTeaser,
  nextVersion,
  OWN_ID,
  parseRef,
  PRESENCE,
  PRESENCE_TEXT,
  PROVENANCE,
  PROVENANCE_TEXT,
  refOptions,
  refText,
  refValue,
  saveDoc,
  saveTarget,
  teaserOrder,
  type Area,
  type IdentityDoc,
  type LineDoc,
  type ProjectDoc,
  type ProjectKind,
  type Reference,
  type SceneDoc,
  type TeaserLink,
  type TeasersDoc,
} from "@/lib/projects";
import { allowedModels, BACKGROUND_STATUS, CATALOGUE_STATUS, modelFamily, statusText } from "@/lib/status";
import type { BackgroundSet, FrameInfo, ProjectDetail, ProjectFile, Ref, SavedProjectFile, TemplateInfo } from "@/lib/types";

import { INPUT } from "./bits";
import { Button, Notice, SectionTitle, Spinner } from "./ui";

/** Identifiers (ids, voices, file names, hashes) are not prose: no autocorrect. */
const IDENT = { autoCorrect: "off", autoCapitalize: "none", spellCheck: false } as const;
const INVALID = "user-invalid:border-error";

type Doc = Record<string, unknown>;

/** What the editors pick from: the server's frames, the checkpoints and samplers its templates name, and the project's backgrounds. */
export interface Choices {
  frames: FrameInfo[];
  templates: TemplateInfo[];
  backgrounds: BackgroundSet[];
}

function Labeled({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="text-small">
      <label htmlFor={id} className="mb-1 block font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="mt-1 block text-caption text-text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A text field for one of the authored texts. */
function AuthoredText({
  label,
  hint,
  value,
  onChange,
  rows = 0,
  required = false,
  max,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  required?: boolean;
  max: number;
}) {
  const id = useId();
  const described = hint ? `${id}-hint` : undefined;
  return (
    <Labeled label={label + (required ? " (required)" : "")} hint={hint} id={id}>
      {rows ? (
        <textarea id={id} className={`${INPUT} ${INVALID}`} rows={rows} value={value} required={required} maxLength={max} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={`${INPUT} ${INVALID}`} value={value} required={required} maxLength={max} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />
      )}
    </Labeled>
  );
}

/** An identifier: argus-mint's pattern, no autocorrect. */
function Ident({ label, hint, value, onChange, pattern = ID_PATTERN, required = true }: { label: string; hint?: string; value: string; onChange: (v: string) => void; pattern?: string; required?: boolean }) {
  const id = useId();
  return (
    <Labeled label={label + (required ? " (required)" : "")} hint={hint} id={id}>
      <input id={id} className={`${INPUT} ${INVALID} font-mono`} value={value} pattern={pattern} required={required} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)} {...IDENT} />
    </Labeled>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  return (
    <Labeled label={label} id={id}>
      <input id={id} type="number" inputMode={step === 1 ? "numeric" : "decimal"} className={`${INPUT} ${INVALID}`} value={value ?? ""} min={min} max={max} step={step} required onChange={(e) => onChange(Number(e.target.value))} />
    </Labeled>
  );
}

function Pick({ label, hint, value, options, onChange, required = true }: { label: string; hint?: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; required?: boolean }) {
  const id = useId();
  return (
    <Labeled label={label} hint={hint} id={id}>
      <select id={id} className={`${INPUT} ${INVALID}`} value={value} required={required} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? "Choose…" : "None"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Labeled>
  );
}

const withCurrent = (list: string[], current: unknown): string[] => (typeof current === "string" && current && !list.includes(current) ? [current, ...list] : list);
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** Files of a kind as options, "lamp-room v1 (✓ Approved)". */
const fileOptions = (detail: ProjectDetail, kind: ProjectKind) =>
  refOptions(detail, kind).map(({ ref, status }) => ({ value: refValue(ref), label: `${refText(ref)} (${statusText(CATALOGUE_STATUS[status])})` }));

const frameOptions = (frames: FrameInfo[], only?: Ref[]) =>
  frames
    .filter((f) => !only?.length || only.some((r) => r.id === f.frame.id && r.version === f.frame.version))
    .map((f) => ({ value: refValue(f.frame), label: `${refText(f.frame)} (${statusText(CATALOGUE_STATUS[f.frame.status])})` }));

function ProjectFields({ doc, set, choices }: { doc: ProjectDoc; set: (d: Partial<ProjectDoc>) => void; choices: Choices }) {
  const families = withCurrent(uniq(["sdxl", ...choices.templates.flatMap((t) => allowedModels(t.template).map(modelFamily))]), doc.family);
  const chosen = doc.frames ?? [];
  return (
    <>
      <AuthoredText label="Working title" hint="What is posted becomes the public name." value={doc.title ?? ""} onChange={(title) => set({ title })} required max={120} />
      <AuthoredText label="Attribution" hint="A fixed line under every quote. Empty: quotes are unsigned." value={doc.attribution ?? ""} onChange={(a) => set({ attribution: a || null })} max={120} />
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={doc.generated_label ?? true} onChange={(e) => set({ generated_label: e.target.checked })} />
        Draw &ldquo;generated image&rdquo; on each teaser (the frame&apos;s label slot)
      </label>
      <fieldset className="text-small">
        <legend className="mb-1 font-medium text-text-secondary">Frames teasers may use</legend>
        {choices.frames.length === 0 ? <p className="text-text-muted">This server has no frames.</p> : null}
        {choices.frames.map((f) => {
          const on = chosen.some((r) => r.id === f.frame.id && r.version === f.frame.version);
          return (
            <label key={refValue(f.frame)} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) =>
                  set({ frames: e.target.checked ? [...chosen, { id: f.frame.id, version: f.frame.version }] : chosen.filter((r) => !(r.id === f.frame.id && r.version === f.frame.version)) })
                }
              />
              {refText(f.frame)} ({statusText(CATALOGUE_STATUS[f.frame.status])})
            </label>
          );
        })}
      </fieldset>
      <Pick
        label="SingGuard policy"
        hint="Every text in the project is checked under it. default is darkroom's SFW policy."
        value={doc.policy ?? "default"}
        options={withCurrent(["default"], doc.policy).map((p) => ({ value: p, label: p }))}
        onChange={(policy) => set({ policy })}
      />
      <Pick label="Checkpoint family" hint="Painting a figure in is SDXL-only for now." value={doc.family ?? "sdxl"} options={families.map((f) => ({ value: f, label: f }))} onChange={(family) => set({ family })} />
    </>
  );
}

function ReferenceRow({ r, set, remove }: { r: Reference; set: (r: Reference) => void; remove: () => void }) {
  return (
    <fieldset className="space-y-2 rounded-md border border-base-600/60 p-2">
      <legend className="px-1 text-caption text-text-muted">Reference</legend>
      <Ident label="File" hint="Relative to the identity file." value={r.file} onChange={(file) => set({ ...r, file })} pattern="[^\s]+" />
      <Ident label="sha256" value={r.sha256} onChange={(sha256) => set({ ...r, sha256 })} pattern="[0-9a-f]{64}" />
      <Pick
        label="Provenance"
        hint="argus-cortex's kind. argus-mint approves only cleared kinds, and checks a consented one against its release."
        value={r.provenance?.kind ?? ""}
        options={withCurrent([...PROVENANCE], r.provenance?.kind).map((p) => ({ value: p, label: PROVENANCE_TEXT[p as keyof typeof PROVENANCE_TEXT] ?? p }))}
        onChange={(kind) => set({ ...r, provenance: { ...r.provenance, kind } })}
      />
      <AuthoredText label="Source" hint="Where the image came from, such as a studio shoot." value={r.provenance?.source ?? ""} onChange={(source) => set({ ...r, provenance: { ...r.provenance, source } })} required max={200} />
      <AuthoredText label="Licence" value={r.provenance?.license ?? ""} onChange={(license) => set({ ...r, provenance: { ...r.provenance, license } })} max={200} />
      {r.provenance?.kind === "consented" ? (
        <>
          <AuthoredText label="Subject, as the release names them" hint="Never shown on the page or in argus-mint's problems." value={r.provenance.subject ?? ""} onChange={(subject) => set({ ...r, provenance: { ...r.provenance, subject } })} required max={200} />
          <Ident label="Release sha256" hint="Binds the consent record; the release itself is never stored." value={r.provenance.release_sha256 ?? ""} onChange={(release_sha256) => set({ ...r, provenance: { ...r.provenance, release_sha256 } })} pattern="[0-9a-f]{64}" />
        </>
      ) : null}
      {r.provenance?.generator ? <p className="text-caption text-text-muted">Its generator record (model, seed, prompt) is kept as it is.</p> : null}
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={Boolean(r.held_out)} onChange={(e) => set({ ...r, held_out: e.target.checked })} />
        Held out of training (argus-proof scores against it)
      </label>
      <Button small tone="danger" onClick={remove}>
        Remove this reference
      </Button>
    </fieldset>
  );
}

function IdentityFields({ doc, set, detail, choices }: { doc: IdentityDoc; set: (d: Partial<IdentityDoc>) => void; detail: ProjectDetail; choices: Choices }) {
  const voices = withCurrent(knownVoices(detail), doc.voice);
  const [newVoice, setNewVoice] = useState(voices.length === 0);
  const refs = doc.references ?? [];
  return (
    <>
      {newVoice ? (
        <Ident label="Voice (a new one)" hint="A short label, such as narrator. Lines in this voice are spoken by this identity." value={doc.voice ?? ""} onChange={(voice) => set({ voice })} pattern="[a-z0-9][a-z0-9\-]{0,31}" />
      ) : (
        <Pick label="Voice" value={doc.voice ?? ""} options={voices.map((v) => ({ value: v, label: v }))} onChange={(voice) => set({ voice })} />
      )}
      {voices.length ? (
        <Button small onClick={() => setNewVoice((v) => !v)}>
          {newVoice ? "Pick a voice the project has" : "A new voice"}
        </Button>
      ) : null}
      <Pick
        label="Presence"
        value={doc.presence ?? ""}
        options={PRESENCE.map((p) => ({ value: p, label: PRESENCE_TEXT[p] }))}
        // What the other presence carries and this one can't, argus-mint refuses, and its field is hidden here: an
        // embodied identity has no frame of its own; a viewpoint one takes no LoRA and trains nothing.
        onChange={(p) =>
          set(
            p === "embodied"
              ? { presence: p, frame: null }
              : p === "viewpoint"
                ? { presence: p, lora: null, proof_run: null, proof_export: null, training: null }
                : { presence: p as IdentityDoc["presence"] },
          )
        }
      />
      {doc.presence === "viewpoint" ? (
        <Pick label="Frame" hint="The reviewed overlay that makes the image theirs." value={refValue(doc.frame)} options={frameOptions(choices.frames)} onChange={(v) => set({ frame: parseRef(v) })} />
      ) : (
        <>
          <AuthoredText label="Appearance prompt" hint="Fixed text: no braces or placeholders." value={doc.prompt ?? ""} onChange={(prompt) => set({ prompt })} rows={3} required={doc.presence === "embodied"} max={2000} />
          <AuthoredText label="Negative prompt" value={doc.negative ?? ""} onChange={(negative) => set({ negative })} rows={2} max={2000} />
        </>
      )}
      {doc.lora ? (
        <p className="text-small text-text-secondary">
          LoRA <code>{doc.lora.name}</code>, pinned from argus-proof&apos;s run <code>{doc.proof_run}</code>: kept as it is.
        </p>
      ) : null}
      <SectionTitle className="mt-2">References</SectionTitle>
      {refs.map((r, i) => (
        <ReferenceRow key={i} r={r} set={(next) => set({ references: refs.map((x, j) => (j === i ? next : x)) })} remove={() => set({ references: refs.filter((_, j) => j !== i) })} />
      ))}
      <Button small onClick={() => set({ references: [...refs, { file: "", sha256: "", provenance: { kind: "synthetic", source: "", license: "" }, held_out: false }] })}>
        Add a reference
      </Button>
    </>
  );
}

function SceneFields({ doc, set, project, choices }: { doc: SceneDoc; set: (d: Partial<SceneDoc>) => void; project: ProjectDoc | undefined; choices: Choices }) {
  const family = project?.family ?? "sdxl";
  const models = withCurrent(uniq(choices.templates.flatMap((t) => allowedModels(t.template)).filter((m) => modelFamily(m) === family)), doc.model);
  const samplings = choices.templates.flatMap(({ template: t }) => [t.sampling, ...Object.values(t.sampling_by_family ?? {}), ...Object.values(t.sampling_by_model ?? {})]).filter(Boolean);
  const samplers = withCurrent(uniq(samplings.map((s) => s!.sampler)), doc.sampling?.sampler);
  const schedulers = withCurrent(uniq(samplings.map((s) => s!.scheduler)), doc.sampling?.scheduler);
  const sampling = doc.sampling ?? { sampler: "", scheduler: "", steps: 25, cfg: 6 };
  const area = doc.character_area;
  const setArea = (a: Partial<Area>) => set({ character_area: { ...(area ?? { x: 0, y: 0, width: 1, height: 1 }), ...a } });
  return (
    <>
      <Pick
        label="Checkpoint"
        hint={`From the templates' reviewed checkpoints in the project's family (${family}).`}
        value={doc.model ?? ""}
        options={models.map((m) => ({ value: m, label: m }))}
        onChange={(model) => set({ model })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Pick label="Sampler" value={sampling.sampler} options={samplers.map((s) => ({ value: s, label: s }))} onChange={(sampler) => set({ sampling: { ...sampling, sampler } })} />
        <Pick label="Scheduler" value={sampling.scheduler} options={schedulers.map((s) => ({ value: s, label: s }))} onChange={(scheduler) => set({ sampling: { ...sampling, scheduler } })} />
        <Num label="Steps" value={sampling.steps} min={1} onChange={(steps) => set({ sampling: { ...sampling, steps } })} />
        <Num label="CFG" value={sampling.cfg} min={0} step={0.1} onChange={(cfg) => set({ sampling: { ...sampling, cfg } })} />
        <Num label="Width" value={doc.width} min={1} max={8192} onChange={(width) => set({ width })} />
        <Num label="Height" value={doc.height} min={1} max={8192} onChange={(height) => set({ height })} />
        <Num label="Backgrounds to render for review" value={doc.backgrounds ?? 3} min={1} max={12} onChange={(backgrounds) => set({ backgrounds })} />
        <Num label="Attempts on a refusal" value={doc.max_attempts ?? 4} min={1} max={16} onChange={(max_attempts) => set({ max_attempts })} />
      </div>
      <AuthoredText label="Background prompt" hint="Fixed text: no braces or placeholders." value={doc.prompt ?? ""} onChange={(prompt) => set({ prompt })} rows={3} required max={2000} />
      <AuthoredText label="Negative prompt" value={doc.negative ?? ""} onChange={(negative) => set({ negative })} rows={2} max={2000} />
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={Boolean(area)} onChange={(e) => set({ character_area: e.target.checked ? { x: 0, y: 0, width: doc.width ?? 1, height: doc.height ?? 1 } : null })} />
        A figure may be painted into this scene
      </label>
      {area ? (
        <fieldset className="grid gap-2 sm:grid-cols-4">
          <legend className="mb-1 text-small font-medium text-text-secondary">Where, in the render&apos;s pixels</legend>
          <Num label="x" value={area.x} min={0} onChange={(x) => setArea({ x })} />
          <Num label="y" value={area.y} min={0} onChange={(y) => setArea({ y })} />
          <Num label="Width" value={area.width} min={1} onChange={(width) => setArea({ width })} />
          <Num label="Height" value={area.height} min={1} onChange={(height) => setArea({ height })} />
        </fieldset>
      ) : null}
    </>
  );
}

function LineFields({ doc, set, detail }: { doc: LineDoc; set: (d: Partial<LineDoc>) => void; detail: ProjectDetail }) {
  const voices = withCurrent(identityVoices(detail), doc.voice);
  return (
    <>
      {voices.length ? (
        <Pick label="Voice" hint="One of the project's identities speaks it." value={doc.voice ?? ""} options={voices.map((v) => ({ value: v, label: v }))} onChange={(voice) => set({ voice })} />
      ) : (
        <Notice tone="warning">Add an identity first: a line&apos;s voice is one of its identities&apos;.</Notice>
      )}
      <AuthoredText label="Text, verbatim from its source" hint="Never edited once written; fix typos in the published wording." value={doc.text ?? ""} onChange={(text) => set({ text })} rows={3} required max={600} />
      <AuthoredText label="Published wording" hint="What goes on the image (typos fixed, nothing else). Empty: the text as it is." value={doc.published ?? ""} onChange={(p) => set({ published: p || null })} rows={3} max={600} />
      <AuthoredText label="Source" hint="Where it was written, such as a scene file." value={doc.source ?? ""} onChange={(source) => set({ source })} required max={200} />
    </>
  );
}

/**
 * The backgrounds rendered from the teaser's scene (that id and version), as options with argus-mint's status.
 * The chosen one is kept even when its set isn't listed. argus-mint refuses a draft from a background that
 * isn't approved, so nothing is filtered here.
 */
function backgroundOptions(sets: BackgroundSet[], scene: Ref | null, current: string | null | undefined): { value: string; label: string }[] {
  const set = scene ? sets.find((s) => s.scene === scene.id && s.scene_version === scene.version) : undefined;
  const out = (set?.backgrounds ?? []).map((b) => ({ value: b.id, label: `${b.id} (${statusText(BACKGROUND_STATUS[b.status ?? "pending"])})` }));
  return current && !out.some((o) => o.value === current) ? [{ value: current, label: `${current} (not in this scene's set)` }, ...out] : out;
}

function TeaserRow({
  n,
  t,
  set,
  remove,
  detail,
  frames,
  projectFrames,
  backgrounds,
}: {
  n: string;
  t: TeaserLink;
  set: (t: TeaserLink) => void;
  remove: () => void;
  detail: ProjectDetail;
  frames: FrameInfo[];
  projectFrames: Ref[];
  backgrounds: BackgroundSet[];
}) {
  const ref = (kind: ProjectKind, key: "line" | "identity" | "scene", label: string) => (
    <Pick label={label} value={refValue(t[key])} options={fileOptions(detail, kind)} onChange={(v) => set({ ...t, [key]: parseRef(v) as Ref })} />
  );
  return (
    <fieldset className="space-y-2 rounded-md border border-base-600/60 p-2">
      <legend className="px-1 font-mono text-small font-semibold">{n}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ref("line", "line", "Line")}
        {ref("identity", "identity", "Identity")}
        {ref("scene", "scene", "Scene")}
        <Pick label="Frame" hint={projectFrames.length ? "One of the project's frames." : undefined} value={refValue(t.frame)} options={frameOptions(frames, projectFrames)} onChange={(v) => set({ ...t, frame: parseRef(v) as Ref })} />
      </div>
      <AuthoredText label="Alt text" hint="Posts refuse an image without it." value={t.alt ?? ""} onChange={(alt) => set({ ...t, alt })} rows={2} required max={1000} />
      <Pick
        label="Background"
        hint="One rendered from this scene. Only an approved background makes a teaser draft."
        value={t.background ?? ""}
        options={backgroundOptions(backgrounds, t.scene ?? null, t.background)}
        onChange={(bg) => set({ ...t, background: bg || null })}
        required={false}
      />
      <Button small tone="danger" onClick={remove}>
        Remove {n}
      </Button>
    </fieldset>
  );
}

function TeasersFields({ doc, set, detail, project, choices }: { doc: TeasersDoc; set: (d: Partial<TeasersDoc>) => void; detail: ProjectDetail; project: ProjectDoc | undefined; choices: Choices }) {
  const teasers = doc.teasers ?? {};
  const blank = { line: null, identity: null, scene: null, frame: null, alt: "" } as unknown as TeaserLink;
  return (
    <>
      {teaserOrder(teasers).map((n) => (
        <TeaserRow
          key={n}
          n={n}
          t={teasers[n]}
          detail={detail}
          frames={choices.frames}
          projectFrames={project?.frames ?? []}
          backgrounds={choices.backgrounds}
          set={(t) => set({ teasers: { ...teasers, [n]: t } })}
          remove={() => set({ teasers: Object.fromEntries(Object.entries(teasers).filter(([k]) => k !== n)) })}
        />
      ))}
      <Button small onClick={() => set({ teasers: { ...teasers, [nextTeaser(teasers)]: blank } })}>
        Add teaser {nextTeaser(teasers)}
      </Button>
    </>
  );
}

/** What a new file of each kind starts as. */
function blankDoc(kind: ProjectKind): Doc {
  if (kind === "project") return { title: "", attribution: null, generated_label: true, frames: [], policy: "default", family: "sdxl" };
  if (kind === "identity") return { voice: "", presence: "embodied", prompt: "", negative: "", references: [] };
  if (kind === "scene") return { model: "", sampling: { sampler: "", scheduler: "", steps: 25, cfg: 6 }, width: 1024, height: 1024, prompt: "", negative: "", backgrounds: 3, character_area: null, max_attempts: 4 };
  if (kind === "line") return { voice: "", text: "", published: null, source: "" };
  return { teasers: {} };
}

/**
 * The editor for one project file: an existing one (saved over itself while a draft, else as its next
 * version) or a new one. Saving sends the fields to argus-mint, which checks them and answers with the
 * saved file and its checks; a refusal is shown in argus-mint's words.
 */
export function FileEditor({
  projectId,
  detail,
  kind,
  file,
  choices,
  disabled,
  onSaved,
  onCancel,
}: {
  projectId: string;
  detail: ProjectDetail | null;
  kind: ProjectKind;
  file?: ProjectFile;
  choices: Choices;
  /** Why saving is off here (no capability, no token), or null. */
  disabled: string | null;
  onSaved: (saved: SavedProjectFile) => void;
  onCancel: () => void;
}) {
  const project = detail?.files.find((f) => f.kind === "project")?.doc as ProjectDoc | undefined;
  const [doc, setDoc] = useState<Doc>(() => (file ? structuredClone(file.doc) : blankDoc(kind)));
  // A project's and its teaser links' id is the project's own; a new project (no detail yet) names it here.
  const fixedId = OWN_ID.includes(kind) && detail ? projectId : null;
  const [newId, setNewId] = useState(fixedId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = file && detail ? saveTarget(detail, file) : { id: fixedId ?? newId, version: detail ? nextVersion(detail, kind, fixedId ?? newId) : 1 };
  const set = (d: Doc) => setDoc((cur) => ({ ...cur, ...d }));
  const headingId = useId();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveProjectFile(detail ? projectId : target.id, kind, target.id, target.version, saveDoc(doc));
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const as = file
    ? file.status === "draft"
      ? `Saving over ${refText(file)} (a draft).`
      : `${refText(file)} is ${statusText(CATALOGUE_STATUS[file.status])}, and argus-mint never changes it, so this saves version ${target.version}.`
    : null;
  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="space-y-3 rounded-md border border-interactive/50 bg-base-900/40 p-3">
      <h3 id={headingId} className="font-display text-small font-semibold">
        {file ? `Edit ${kind} ${file.id}` : `New ${kind}`}
        {target.id ? ` → ${target.id} v${target.version}` : ""}
      </h3>
      {as ? <p className="text-caption text-text-muted">{as}</p> : null}
      {!file && !fixedId ? (
        <Ident
          label={detail ? "Id" : "Project id"}
          hint={detail ? "Lower-case letters, digits and hyphens." : "Lower-case letters, digits and hyphens: the project's directory, and the id of its project and teaser link files."}
          value={newId}
          onChange={setNewId}
        />
      ) : null}
      {kind === "project" ? <ProjectFields doc={doc as unknown as ProjectDoc} set={set} choices={choices} /> : null}
      {kind === "identity" && detail ? <IdentityFields doc={doc as unknown as IdentityDoc} set={set} detail={detail} choices={choices} /> : null}
      {kind === "scene" ? <SceneFields doc={doc as unknown as SceneDoc} set={set} project={project} choices={choices} /> : null}
      {kind === "line" && detail ? <LineFields doc={doc as unknown as LineDoc} set={set} detail={detail} /> : null}
      {kind === "teasers" && detail ? <TeasersFields doc={doc as unknown as TeasersDoc} set={set} detail={detail} project={project} choices={choices} /> : null}
      <p className="text-caption text-text-muted">
        argus-mint checks the file when it is saved: its schema, what it says about the project&apos;s other files, the private spoiler list
        (by rule number only) and SingGuard under the project&apos;s policy. It is saved as a draft; nothing renders from it until it is approved.
      </p>
      {disabled ? <p className="text-small text-text-muted">{disabled}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={Boolean(disabled) || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-interactive px-3.5 py-2 text-small font-medium text-on-accent hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save draft
        </button>
        <Button onClick={onCancel}>Cancel</Button>
        {busy ? <Spinner /> : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}

/** A new project: argus-mint starts one with its project.yaml (`files/project/{id}/1`). */
export function NewProject({ choices, disabled, onSaved, onCancel }: { choices: Choices; disabled: string | null; onSaved: (saved: SavedProjectFile) => void; onCancel: () => void }) {
  return <FileEditor projectId="" detail={null} kind="project" choices={choices} disabled={disabled} onSaved={onSaved} onCancel={onCancel} />;
}
