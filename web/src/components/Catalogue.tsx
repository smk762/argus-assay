"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { checkTemplate, decide, startSamples } from "@/lib/api";
import { readReviewer, saveReviewer } from "@/lib/reviewer";
import { allowedModels, catalogueAction, loraChoices, samplingHint } from "@/lib/status";
import { displaySlots } from "@/lib/slots";
import type { BioInfo, CatalogueKind, CatalogueStatus, FrameInfo, TemplateCheck, TemplateInfo } from "@/lib/types";

import { DocLink, Field, INPUT, useLoad } from "./bits";
import { CheckpointOptions, LoraPicker } from "./Checkpoints";
import { useMint } from "./MintProvider";
import { Button, Card, Notice, SectionTitle, Spinner } from "./ui";

export type TemplateCheckState = { capable: boolean; demo: boolean; data: TemplateCheck | null; error: string | null; reload: () => void };

/**
 * argus-mint's check of a template against darkroom's model list: checkpoints, LoRAs, sampler and
 * scheduler exist, and a workflow renders every checkpoint with each LoRA count allowed. Asked only
 * where `/health` says the server can check. One result feeds both the panel and the decision.
 */
export function useTemplateCheck(id: string, version: number, enabled: boolean): TemplateCheckState {
  const { health } = useMint();
  const capable = enabled && Boolean(health?.capabilities.check_templates);
  const check = useLoad(() => (capable ? checkTemplate(id, version) : Promise.resolve(null)), [id, version, capable]);
  return { capable, demo: Boolean((health as { mock?: boolean } | null)?.mock), ...check };
}

/** The check as argus-mint reports it; argus-mint refuses to approve while it finds problems. */
export function TemplateCheckPanel({ check }: { check: TemplateCheckState }) {
  const { capable } = check;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <SectionTitle>Check against darkroom</SectionTitle>
          <DocLink topic="darkroom-check">What it checks</DocLink>
        </div>
        {capable ? (
          <Button small onClick={check.reload} disabled={!check.data && !check.error}>
            Check again
          </Button>
        ) : null}
      </div>
      {!capable ? (
        <p className="text-small text-text-muted">
          {check.demo
            ? "The demo has no darkroom to ask. A live argus-mint checks each template against darkroom before it can be approved."
            : "This server can't check templates: no darkroom is configured for it to ask."}
        </p>
      ) : check.error ? (
        <Notice tone="error">{check.error}</Notice>
      ) : !check.data ? (
        <Spinner />
      ) : check.data.ok ? (
        <p className="text-small">
          <span className="font-semibold text-success">✓ Renders:</span> darkroom has every checkpoint, LoRA, sampler and scheduler this template names,
          and a workflow for each checkpoint at every LoRA count it allows.
        </p>
      ) : (
        <>
          <p className="mb-1 text-small">
            <span className="font-semibold text-error">✕ Won&apos;t render:</span> {check.data.problems.length} problem
            {check.data.problems.length === 1 ? "" : "s"}. argus-mint refuses to approve it until they&apos;re fixed.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-small text-text-secondary">
            {check.data.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Approve a draft or retire an approved file. argus-mint writes it into the file. */
export function DecisionPanel({
  kind,
  id,
  version,
  status,
  onDone,
  warning,
}: {
  kind: CatalogueKind;
  id: string;
  version: number;
  status: CatalogueStatus;
  onDone: () => void;
  /** Something argus-mint has reported that it will refuse on; shown, never used to disable the decision. */
  warning?: string | null;
}) {
  const { health, hasToken } = useMint();
  const [by, setBy] = useState(readReviewer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = catalogueAction(status);
  if (!action) return <p className="text-small text-text-muted">Retired: kept so cards made with it still verify. Nothing more to decide.</p>;
  const off = !health?.capabilities.review_catalogue
    ? "This server can't record catalogue decisions (read-only, or its files aren't writable)."
    : !hasToken
      ? "Set the moderator token (key icon) to decide."
      : null;
  const what = action === "approve" ? `Approve ${kind} ${id} v${version}` : `Retire ${kind} ${id} v${version}`;
  const consequence =
    action === "approve"
      ? kind === "template"
        ? "Cards can then be rendered from every combination of its variables."
        : kind === "frame"
          ? "Cards can then be framed with it."
          : "Card bios can then be written with it."
      : "No new cards can use it. Cards already made keep their hash.";
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Decision</SectionTitle>
        <DocLink topic="catalogue-review">How the catalogue is reviewed</DocLink>
      </div>
      <p className="mb-2 text-small text-text-secondary">
        {consequence} argus-mint records <code>status</code>, <code>approved_by</code> and <code>approved_at</code> in the file. Commit that
        change to the repo the server serves from.
      </p>
      {off ? <p className="mb-2 text-small text-text-muted">{off}</p> : null}
      {warning && action === "approve" ? (
        <Notice tone="warning" className="mb-2">
          {warning}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-60`} placeholder="Your name" value={by} onChange={(e) => setBy(e.target.value)} disabled={!!off} />
        <Button
          tone={action === "approve" ? "primary" : "danger"}
          disabled={!!off || busy || !by.trim()}
          onClick={async () => {
            if (!window.confirm(`${what}?\n\n${consequence}`)) return;
            setBusy(true);
            setError(null);
            try {
              saveReviewer(by.trim());
              await decide(kind, id, version, action, by.trim());
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {action === "approve" ? "Approve" : "Retire"}
        </Button>
        {busy ? <Spinner /> : null}
      </div>
      {error ? <Notice tone="error" className="mt-2">{error}</Notice> : null}
    </Card>
  );
}

/** Render sample cards of a template (any status), optionally framed and with a bio, as a background job. */
export function SampleRunner({
  templates,
  frames,
  bios,
  fixed,
}: {
  templates: TemplateInfo[];
  frames: FrameInfo[];
  bios: BioInfo[];
  fixed?: { template?: string; frame?: string; bio?: string };
}) {
  const router = useRouter();
  const { health, hasToken } = useMint();
  const key = (id: string, v: number) => `${id}@${v}`;
  const [template, setTemplate] = useState(fixed?.template ?? (templates[0] ? key(templates[0].template.id, templates[0].template.version) : ""));
  const [frame, setFrame] = useState(fixed?.frame ?? "");
  const [bio, setBio] = useState(fixed?.bio ?? "");
  const [count, setCount] = useState(4);
  const [model, setModel] = useState("");
  const [loras, setLoras] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(0);
  const [name, setName] = useState("Sample");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = templates.find((x) => key(x.template.id, x.template.version) === template)?.template;
  const f = frames.find((x) => key(x.frame.id, x.frame.version) === frame)?.frame;
  // A checkpoint chosen for another template doesn't carry over to one that doesn't allow it.
  const modelValue = t && allowedModels(t).slice(1).includes(model) ? model : "";
  const chosenLoras = t ? loraChoices(loras, t, modelValue || t.model) : [];
  const ref = (k: string) => (k ? { id: k.split("@")[0], version: Number(k.split("@")[1]) } : null);
  const off = !health?.capabilities.sample ? "This server can't render samples (no darkroom, or read-only)." : !hasToken ? "Set the moderator token to render samples." : null;
  return (
    <Card>
      <SectionTitle className="mb-2">Render samples</SectionTitle>
      <p className="mb-3 text-small text-text-secondary">
        Sample cards for review, from any status of template, frame and bio template. They stay on the server and are never pinned, signed or
        minted. Each takes about half a minute; darkroom renders one at a time.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Template">
          <select className={INPUT} value={template} onChange={(e) => setTemplate(e.target.value)} disabled={!!fixed?.template}>
            {templates.map((x) => (
              <option key={key(x.template.id, x.template.version)} value={key(x.template.id, x.template.version)}>
                {x.template.id} v{x.template.version} ({x.template.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Frame">
          <select className={INPUT} value={frame} onChange={(e) => setFrame(e.target.value)} disabled={!!fixed?.frame}>
            <option value="">None</option>
            {frames.map((x) => (
              <option key={key(x.frame.id, x.frame.version)} value={key(x.frame.id, x.frame.version)}>
                {x.frame.id} v{x.frame.version} ({x.frame.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bio template">
          <select className={INPUT} value={bio} onChange={(e) => setBio(e.target.value)} disabled={!!fixed?.bio}>
            <option value="">None</option>
            {bios.map((x) => (
              <option key={key(x.bio.id, x.bio.version)} value={key(x.bio.id, x.bio.version)}>
                {x.bio.id} v{x.bio.version} ({x.bio.status})
              </option>
            ))}
          </select>
        </Field>
      </div>
      {t ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Checkpoint" hint={samplingHint(t, modelValue || t.model)}>
            <select className={INPUT} value={modelValue} onChange={(e) => setModel(e.target.value)}>
              <CheckpointOptions models={allowedModels(t)} defaultModel={t.model} />
            </select>
          </Field>
          {Object.entries(t.variables).map(([name, values]) => (
            <Field key={name} label={name}>
              <select className={INPUT} value={values.includes(vars[name]) ? vars[name] : ""} onChange={(e) => setVars({ ...vars, [name]: e.target.value })}>
                <option value="">Any (varies)</option>
                {values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      ) : null}
      {t ? <LoraPicker t={t} model={modelValue || t.model} picked={loras} onChange={setLoras} /> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="How many">
          <input type="number" min={1} max={12} className={INPUT} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </Field>
        <Field label="Seed" hint="Picks the combinations and the first render seed.">
          <input type="number" min={0} className={INPUT} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </Field>
        <Field label="Card name" hint="Drawn on the frame; never sent to a model.">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {displaySlots(f).map((slot) => (
          <Field key={slot} label={`Text: ${slot}`}>
            <input className={INPUT} value={texts[slot] ?? ""} onChange={(e) => setTexts({ ...texts, [slot]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          tone="primary"
          disabled={!!off || busy || !t}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const job = await startSamples({
                template: ref(template)!,
                frame: ref(frame),
                bio: ref(bio),
                // The default checkpoint and no LoRAs are left out, so an older argus-mint still takes the request.
                ...(modelValue ? { model: modelValue } : {}),
                ...(chosenLoras.length ? { loras: chosenLoras } : {}),
                count,
                seed,
                name: name.trim() || "Sample",
                // Only this template's variables and this frame's slots: picks made for another one don't carry over.
                variables: Object.fromEntries(Object.entries(vars).filter(([k, v]) => v && t?.variables[k]?.includes(v))),
                texts: Object.fromEntries(Object.entries(texts).filter(([k, v]) => v && displaySlots(f).includes(k))),
              });
              router.push(`/samples/${job.id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Render {count} sample{count === 1 ? "" : "s"}
        </Button>
        {busy ? <Spinner /> : null}
        {off ? <span className="text-small text-text-muted">{off}</span> : null}
      </div>
      {error ? <Notice tone="error" className="mt-2">{error}</Notice> : null}
    </Card>
  );
}
