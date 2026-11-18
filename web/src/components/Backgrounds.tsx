"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
/**
 * A teaser project's backgrounds (argus-mint docs/projects.md, Backgrounds): per scene, the job that renders
 * them, the images with their status, and the moderator's decision on each. Statuses, the job's progress and
 * what a job may render are argus-mint's; the page starts a job and sends a decision, nothing else.
 */
import { useEffect, useState } from "react";

import { backgroundImage, reviewBackground, startBackgrounds } from "@/lib/api";
import { staticDemo } from "@/lib/demo";
import { filesOf, refText } from "@/lib/projects";
import { readReviewer, saveReviewer } from "@/lib/reviewer";
import { BACKGROUND_STATUS, checkpointName, JOB_STATUS, loraText, samplingText } from "@/lib/status";
import { when } from "@/lib/time";
import type { Background, BackgroundSet, BackgroundSetList, ProjectDetail, ProjectFile } from "@/lib/types";

import { CatalogueBadge, DocLink, Hash, INPUT, StatusBadge } from "./bits";
import { useMint } from "./MintProvider";
import { Button, Card, Collapsible, Kv, Notice, Spinner } from "./ui";

/** Why the moderator can't start a job or decide here, or null: the server's capability, then the token. */
export function useBackgroundsOff(): string | null {
  const { health, hasToken } = useMint();
  if (!health) return "Waiting for argus-mint.";
  if (!health.capabilities.backgrounds) {
    return staticDemo()
      ? "This demo shows the recorded backgrounds; rendering and reviewing them need a running argus-mint."
      : "This server can't render or review backgrounds (no moderator token or darkroom is set on it, or it is read-only).";
  }
  return hasToken ? null : "Set the moderator token (key icon) to render and review backgrounds.";
}

/** The set argus-mint rendered from this scene file (same id and version), if any. */
export const setOf = (list: BackgroundSetList | null, scene: { id: string; version: number }): BackgroundSet | undefined =>
  list?.sets.find((s) => s.scene === scene.id && s.scene_version === scene.version);

/** Does any job still run, by argus-mint's own job status? Then the page asks again. */
export const anyJobLive = (list: BackgroundSetList | null): boolean =>
  Boolean(list?.sets.some((s) => s.job && (s.job.status === "queued" || s.job.status === "running")));

function Decide({ projectId, bg, off, onDone }: { projectId: string; bg: Background; off: string | null; onDone: () => void }) {
  const [by, setBy] = useState(readReviewer);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      saveReviewer(by.trim());
      await reviewBackground(projectId, bg.id, decision, by.trim(), note.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <input className={INPUT} aria-label={`Your name, recorded with the decision on ${bg.id}`} placeholder="Your name" value={by} onChange={(e) => setBy(e.target.value)} disabled={Boolean(off)} />
      <textarea className={INPUT} rows={2} aria-label={`Note on ${bg.id}`} placeholder="Note (say why, if rejecting)" value={note} onChange={(e) => setNote(e.target.value)} disabled={Boolean(off)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button small tone="primary" disabled={Boolean(off) || busy || !by.trim()} onClick={() => decide("approve")}>
          Approve
        </Button>
        <Button small tone="danger" disabled={Boolean(off) || busy || !by.trim()} onClick={() => decide("reject")}>
          Reject
        </Button>
        {busy ? <Spinner /> : null}
      </div>
      {error ? <Notice tone="error">argus-mint refused: {error}</Notice> : null}
    </div>
  );
}

function BackgroundTile({ projectId, bg, first, off, reload }: { projectId: string; bg: Background; first: boolean; off: string | null; reload: () => void }) {
  return (
    <li id={`bg-${bg.id}`} className="scroll-mt-4 space-y-2 rounded-md border border-base-600/50 p-2">
      <img
        src={backgroundImage(projectId, bg.id)}
        alt={`Background ${bg.id}, as rendered`}
        width={bg.request.width}
        height={bg.request.height}
        loading={first ? undefined : "lazy"}
        className="aspect-square w-full rounded bg-base-900 object-contain"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-small font-semibold">{bg.id}</span>
        <StatusBadge s={BACKGROUND_STATUS[bg.status ?? "pending"]} />
      </div>
      <dl>
        <Kv label="sha256">
          <Hash value={bg.sha256} />
        </Kv>
        <Kv label="Seed">{bg.seed}</Kv>
        <Kv label="Attempts">{bg.attempts.length}</Kv>
        <Kv label="Rendered">{when(bg.created_at)}</Kv>
      </dl>
      {bg.review ? (
        <p className="text-small">
          {bg.review.decision === "approved" ? "Approved" : "Rejected"} by {bg.review.by} · {when(bg.review.at)}
          {bg.review.note ? <span className="block text-text-secondary">“{bg.review.note}”</span> : null}
        </p>
      ) : null}
      {bg.status === "pending" || bg.status === undefined ? <Decide projectId={projectId} bg={bg} off={off} onDone={reload} /> : null}
      <Collapsible title="Request and attempts">
        <pre className="max-h-60 overflow-auto text-caption">{JSON.stringify({ request: bg.request, attempts: bg.attempts, made_with: bg.made_with }, null, 2)}</pre>
      </Collapsible>
    </li>
  );
}

function SceneBackgrounds({ projectId, scene, set, off, reload }: { projectId: string; scene: ProjectFile; set: BackgroundSet | undefined; off: string | null; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = set?.job ?? null;
  const first = set?.backgrounds?.[0];
  return (
    <Card as="article" className="space-y-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-small font-semibold">Scene {refText(scene)}</h3>
        <CatalogueBadge status={scene.status} />
        {set ? <span className="text-caption text-text-muted">{set.wanted} wanted</span> : null}
        {job ? (
          <span className="ml-auto flex items-center gap-2 text-caption text-text-muted">
            Job <StatusBadge s={JOB_STATUS[job.status]} /> started {when(job.created_at)}
            {job.finished_at ? `, finished ${when(job.finished_at)}` : ""}
          </span>
        ) : null}
      </header>
      {job?.error ? <Notice tone="error">The job stopped: {job.error}</Notice> : null}
      {first ? (
        <p className="text-caption text-text-muted">
          {checkpointName(first.request.model)}, {first.request.width}×{first.request.height}
          {first.request.sampling ? `, ${samplingText(first.request.sampling)}` : ""}
          {first.request.loras.length ? `, LoRAs ${loraText(first.request.loras)}` : ", no LoRA"}
        </p>
      ) : null}
      {set?.backgrounds?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {set.backgrounds.map((bg, i) => (
            <BackgroundTile key={bg.id} projectId={projectId} bg={bg} first={i === 0} off={off} reload={reload} />
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">No backgrounds rendered from this scene yet.</p>
      )}
      {set?.failed?.length ? (
        <div>
          <h4 className="text-caption text-text-muted">Not rendered</h4>
          <ul className="text-small">
            {set.failed.map((f) => (
              <li key={f.n}>
                #{f.n} (seed {f.seed}, {f.attempts.length} attempt{f.attempts.length === 1 ? "" : "s"}): {f.error}{" "}
                <span className="text-text-muted">{f.final ? "Refused by the safety check every time: not tried again." : "Tried again by the next job."}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-base-600/40 pt-3">
        <Button
          small
          disabled={Boolean(off) || busy}
          title={off ?? undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await startBackgrounds(projectId, scene.id, scene.version);
              reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Render the missing backgrounds of {refText(scene)}
        </Button>
        {busy ? <Spinner /> : null}
      </div>
      {error ? <Notice tone="error">argus-mint refused: {error}</Notice> : null}
    </Card>
  );
}

/** One card per scene file of the project, each with the set argus-mint rendered from it. */
export function BackgroundsSection({
  projectId,
  detail,
  list,
  error,
  reload,
}: {
  projectId: string;
  detail: ProjectDetail;
  list: BackgroundSetList | null;
  error: string | null;
  reload: () => void;
}) {
  const off = useBackgroundsOff();
  const live = anyJobLive(list);
  // A running job is asked about again until argus-mint says it is done or failed.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [live, reload]);
  const scenes = filesOf(detail, "scene");
  return (
    <section id="backgrounds" aria-labelledby="backgrounds-title" className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="backgrounds-title" className="font-display text-subheading font-semibold">
          Backgrounds
        </h2>
        <DocLink topic="backgrounds">How backgrounds are rendered and reviewed</DocLink>
      </div>
      <p className="max-w-3xl text-small text-text-secondary">
        A job renders an approved scene&apos;s backgrounds that have no image yet, through darkroom at batch priority. The moderator approves or
        rejects each one; only an approved background goes into a teaser, chosen in a new version of the teaser links.
      </p>
      {off ? <p className="text-small text-text-muted">{off}</p> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!list && !error ? <Spinner /> : null}
      {scenes.length === 0 ? <p className="text-small text-text-muted">No scenes yet.</p> : null}
      {list ? scenes.map((s) => <SceneBackgrounds key={`${s.id}/${s.version}`} projectId={projectId} scene={s} set={setOf(list, s)} off={off} reload={reload} />) : null}
    </section>
  );
}
