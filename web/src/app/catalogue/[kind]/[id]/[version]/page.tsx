"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { DecisionPanel, SampleRunner } from "@/components/Catalogue";
import { CatalogueBadge, Field, Hash, INPUT, PageTitle, useLoad } from "@/components/bits";
import { Button, Card, Kv, Notice, SectionTitle, Spinner } from "@/components/ui";
import { frameOverlay, getBios, getDrafts, getFrames, getSamples, getTemplates, previewFrame } from "@/lib/api";
import { allowedModels, byFamily, checkpointName, loraText, loraWeights, samplingText } from "@/lib/status";
import { boxStyle, cropFraction, displaySlots, slotSummary, windowAspect } from "@/lib/slots";
import type { BioInfo, FrameInfo, TemplateInfo } from "@/lib/types";

function Approval({ by, at }: { by?: string | null; at?: string | null }) {
  return by ? (
    <Kv label="Approved">
      {by}, {at}
    </Kv>
  ) : null;
}

function TemplateView({ info }: { info: TemplateInfo }) {
  const t = info.template;
  return (
    <Card>
      <dl>
        <Kv label="File">{info.file}</Kv>
        <Kv label="Hash"><Hash value={info.hash} /></Kv>
        <Approval by={t.approved_by} at={t.approved_at} />
        <Kv label="Model">{t.model}</Kv>
        {byFamily(allowedModels(t).slice(1)).map((g) => (
          <Kv key={g.family} label={`Also allowed${g.family ? ` (${g.family})` : ""}`}>
            {g.models.map((m) => (
              <span key={m} className="block" title={m}>
                {checkpointName(m)}
              </span>
            ))}
          </Kv>
        ))}
        <Kv label="Size">{t.width}×{t.height}</Kv>
        {t.sampling ? <Kv label="Sampling">{samplingText(t.sampling)}</Kv> : null}
        {Object.entries(t.sampling_by_family ?? {}).map(([family, s]) => (
          <Kv key={family} label={`Sampling (${family})`}>
            {samplingText(s)}
          </Kv>
        ))}
        {t.loras?.length ? <Kv label="LoRAs, always applied">{loraText(t.loras)}</Kv> : null}
        {t.lora_options?.length ? (
          <Kv label={`LoRA options (up to ${t.max_loras ?? 1} per card)`}>
            {t.lora_options.map((o) => (
              <span key={o.name} className="block" title={o.name}>
                {checkpointName(o.name)}: weight {loraWeights(o).join(" or ")}
                {o.trigger_words?.length ? `, adds “${o.trigger_words.join(", ")}”` : ""}
                {o.models?.length ? `, with ${o.models.map(checkpointName).join(", ")}` : ", with any checkpoint"}
              </span>
            ))}
          </Kv>
        ) : null}
        <Kv label="Retries">up to {t.max_attempts ?? 4} on a safety rejection</Kv>
        <Kv label="Combinations">{info.combinations.toLocaleString()}</Kv>
      </dl>
      <SectionTitle className="mb-1 mt-3">Prompt</SectionTitle>
      <p className="text-small">{t.prompt}</p>
      <SectionTitle className="mb-1 mt-3">Negative</SectionTitle>
      <p className="text-small text-text-secondary">{t.negative || "none"}</p>
      <SectionTitle className="mb-1 mt-3">Variables</SectionTitle>
      <dl className="space-y-1 text-small">
        {Object.entries(t.variables).map(([name, values]) => (
          <div key={name}>
            <dt className="inline font-medium">{name}</dt>: <dd className="inline text-text-secondary">{values.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function BioView({ info }: { info: BioInfo }) {
  const b = info.bio;
  return (
    <Card>
      <dl>
        <Kv label="File">{info.file}</Kv>
        <Kv label="Hash"><Hash value={info.hash} /></Kv>
        <Approval by={b.approved_by} at={b.approved_at} />
        <Kv label="Model">{b.model}</Kv>
        <Kv label="Temperature">{b.temperature ?? 0.9}</Kv>
        <Kv label="Length">up to {b.max_chars ?? 400} characters</Kv>
        <Kv label="Retries">up to {b.max_attempts ?? 4} when darkroom flags a bio</Kv>
      </dl>
      <SectionTitle className="mb-1 mt-3">System prompt</SectionTitle>
      <p className="whitespace-pre-wrap text-small">{b.system}</p>
      <SectionTitle className="mb-1 mt-3">Prompt</SectionTitle>
      <p className="text-small">{b.prompt}</p>
      <p className="mt-2 text-caption text-text-muted">
        The model sees only the template&apos;s fixed values and a {"{name}"} token; argus-mint puts the card&apos;s name in afterwards.
      </p>
    </Card>
  );
}

function FrameView({ info }: { info: FrameInfo }) {
  const f = info.frame;
  const search = useSearchParams();
  const drafts = useLoad(() => getDrafts());
  const samples = useLoad(() => getSamples());
  const arts = [
    ...(drafts.data?.items ?? []).map((d) => ({ key: `d:${d.id}`, label: `Draft: ${d.name}`, art: { draft: d.id } })),
    ...(samples.data?.items ?? []).flatMap((j) =>
      (j.items ?? []).filter((i) => i.art).map((i) => ({ key: `s:${j.id}:${i.n}`, label: `Sample ${j.id.slice(0, 6)} #${i.n}: ${Object.values(i.variables).join(", ")}`, art: { sample: j.id, n: i.n } })),
    ),
  ];
  const initial = search.get("sample") ? `s:${search.get("sample")}:${search.get("n") ?? 1}` : "";
  const [art, setArt] = useState(initial);
  const [name, setName] = useState("Emerald Wizard");
  const [bio, setBio] = useState("Sings to the spines of forgotten books, and the library, charmed, rearranges itself to listen.");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState(true);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const chosen = arts.find((a) => a.key === (art || arts[0]?.key));
  const aspect = windowAspect(f);
  const crop = cropFraction(1024, 1024, f);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="relative">
          <img src={url ?? frameOverlay(f.id, f.version)} alt={url ? "Preview of the frame on the chosen art" : "The frame overlay"} className="w-full rounded-lg border border-base-600/60 bg-[repeating-conic-gradient(#8884_0_25%,transparent_0_50%)] bg-[length:16px_16px]" />
          {boxes && !url ? (
            <>
              <div className="absolute border-2 border-dashed border-accent-tertiary" style={boxStyle(f.window, info.width, info.height)}>
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-caption text-white">art window</span>
              </div>
              {Object.entries(f.texts ?? {}).map(([slot, box]) => (
                <div key={slot} className="absolute border-2 border-dashed border-warm-primary" style={boxStyle(box, info.width, info.height)}>
                  <span className="absolute left-1 top-0 rounded bg-black/60 px-1 text-caption text-white">{slot}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          {url ? <Button small onClick={() => setUrl(null)}>Show the bare overlay</Button> : null}
          {!url ? <Button small onClick={() => setBoxes((v) => !v)}>{boxes ? "Hide boxes" : "Show boxes"}</Button> : null}
        </div>
      </div>
      <div className="space-y-4">
        <Card>
          <dl>
            <Kv label="File">{info.file}</Kv>
            <Kv label="Hash"><Hash value={info.hash} /></Kv>
            <Approval by={f.approved_by} at={f.approved_at} />
            <Kv label="Card size">{info.width}×{info.height}</Kv>
            <Kv label="Art window">{`${f.window.width}×${f.window.height} at (${f.window.x}, ${f.window.y})`}</Kv>
            <Kv label="Best render size">{aspect.suggest}</Kv>
          </dl>
          {crop > 0.1 ? (
            <Notice tone="warning" className="mt-2">
              A square 1024×1024 render loses {Math.round(crop * 100)}% of its area here. Templates for this frame should render {aspect.suggest}.
            </Notice>
          ) : null}
          <SectionTitle className="mb-1 mt-3">Text slots</SectionTitle>
          <ul className="text-small">
            {Object.entries(f.texts ?? {}).map(([slot, box]) => (
              <li key={slot}>
                <b>{slot}</b> <span className="text-text-secondary">{slotSummary(box)}</span>
                {slot === "name" || slot === "bio" ? <span className="text-caption text-text-muted"> (filled by argus-mint)</span> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle className="mb-2">Preview on art</SectionTitle>
          {arts.length === 0 ? (
            <p className="text-small text-text-muted">No art yet: render samples below or create a draft, then preview here.</p>
          ) : (
            <div className="space-y-2">
              <Field label="Art">
                <select className={INPUT} value={chosen?.key ?? ""} onChange={(e) => setArt(e.target.value)}>
                  {arts.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Name">
                <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              {f.texts?.bio ? (
                <Field label="Bio (sample text)">
                  <textarea className={INPUT} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
                </Field>
              ) : null}
              {displaySlots(f).map((slot) => (
                <Field key={slot} label={`Text: ${slot}`}>
                  <input className={INPUT} value={texts[slot] ?? ""} onChange={(e) => setTexts({ ...texts, [slot]: e.target.value })} />
                </Field>
              ))}
              <div className="flex items-center gap-2">
                <Button
                  tone="primary"
                  disabled={busy || !chosen}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      setUrl(await previewFrame(f.id, f.version, chosen!.art, name || "Sample", f.texts?.bio ? bio : null, Object.fromEntries(Object.entries(texts).filter(([, v]) => v))));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Preview
                </Button>
                {busy ? <Spinner /> : null}
              </div>
              {error ? <Notice tone="error">{error}</Notice> : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Detail() {
  const { kind, id, version } = useParams<{ kind: string; id: string; version: string }>();
  const v = Number(version);
  const all = useLoad(() => Promise.all([getTemplates(), getFrames(), getBios()]), [kind, id, version]);
  if (all.error) return <Notice tone="error">{all.error}</Notice>;
  if (!all.data) return <Spinner />;
  const [templates, frames, bios] = all.data;
  const t = kind === "template" ? templates.find((x) => x.template.id === id && x.template.version === v) : undefined;
  const f = kind === "frame" ? frames.find((x) => x.frame.id === id && x.frame.version === v) : undefined;
  const b = kind === "bio" ? bios.find((x) => x.bio.id === id && x.bio.version === v) : undefined;
  const status = t?.template.status ?? f?.frame.status ?? b?.bio.status;
  if (!status) return <Notice tone="error">No {kind} {id} v{version}.</Notice>;
  const k = `${id}@${v}`;
  return (
    <>
      <p className="mb-1 text-caption">
        <Link href="/catalogue" className="text-text-muted hover:text-text-secondary">
          ← Catalogue
        </Link>
      </p>
      <PageTitle aside={<CatalogueBadge status={status} />}>
        {kind === "bio" ? "Bio template" : kind === "frame" ? "Frame" : "Template"} {id} v{version}
      </PageTitle>
      <div className="space-y-4">
        {t ? <TemplateView info={t} /> : null}
        {f ? <FrameView info={f} /> : null}
        {b ? <BioView info={b} /> : null}
        <SampleRunner
          templates={templates}
          frames={frames}
          bios={bios}
          fixed={kind === "template" ? { template: k } : kind === "frame" ? { frame: k } : { bio: k }}
        />
        <DecisionPanel kind={kind as "template" | "frame" | "bio"} id={id} version={v} status={status} onDone={all.reload} />
      </div>
    </>
  );
}

export default function CatalogueDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Detail />
    </Suspense>
  );
}
