"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
/**
 * An embodied identity's LoRA training (argus-mint docs/projects.md, Training an identity), as argus-mint
 * records it: each step's status, every run with the sibling's ids, the candidates, the selection, the
 * captions, the LoRA, proof's evaluation and what was pinned. The one button runs argus-mint's `next`
 * step and no other: the page never picks a step, skips one or starts two.
 */
import { useEffect, useState } from "react";

import { getTraining, startTrainingStep, trainingCandidate } from "@/lib/api";
import { staticDemo } from "@/lib/demo";
import { JOB_STATUS, STEP_STATUS, TRAINING_STEPS } from "@/lib/status";
import { when } from "@/lib/time";
import type { IdentityTrainingView, ProjectFile, StepRun } from "@/lib/types";

import { DocLink, Hash, StatusBadge, useLoad } from "./bits";
import { useMint } from "./MintProvider";
import { Button, Collapsible, Kv, Notice, Spinner } from "./ui";

/** Why the moderator can't run a step here, or null. */
function useTrainingOff(): string | null {
  const { health, hasToken } = useMint();
  if (!health) return "Waiting for argus-mint.";
  if (!health.capabilities.identity_training) {
    return staticDemo()
      ? "This demo shows the recorded training record; running a step needs a running argus-mint with curator, lens, forge and proof."
      : "This server can't train identities (it needs darkroom, curator, lens, forge, proof, the shared directories and the moderator token, and must not be read-only).";
  }
  return hasToken ? null : "Set the moderator token (key icon) to run a training step.";
}

const PASS = {
  passed: { label: "Passes", mark: "✓", tone: "ok" },
  failed: { label: "Doesn't pass", mark: "✕", tone: "error" },
  // argus-mint's `pending`: proof waits for a person's ratings, so `passed` is no verdict yet.
  pending: { label: "Waiting for ratings", mark: "…", tone: "warning" },
} as const;

/** A sibling's ids (curator's scan, forge's run, proof's run), as argus-mint recorded them. */
function Sibling({ ids }: { ids: Record<string, string> | undefined }) {
  const entries = Object.entries(ids ?? {});
  if (!entries.length) return <span className="text-text-muted">none</span>;
  return (
    <>
      {entries.map(([k, v]) => (
        <span key={k} className="mr-2 inline-block">
          {k} <code className="text-caption">{v}</code>
        </span>
      ))}
    </>
  );
}

function RunLine({ run }: { run: StepRun }) {
  return (
    <li className="border-t border-base-600/40 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-small">{run.step}</span>
        <StatusBadge s={JOB_STATUS[run.status]} />
        <span className="text-caption text-text-muted">
          job <code>{run.job}</code>, started {when(run.started_at)}
          {run.finished_at ? `, finished ${when(run.finished_at)}` : ""}
        </span>
      </div>
      <p className="text-caption">
        Sibling ids: <Sibling ids={run.sibling} />
      </p>
      {run.error ? <p className="text-caption text-error">{run.error}</p> : null}
      <Collapsible title="Inputs and outputs">
        <pre className="max-h-60 overflow-auto text-caption">{JSON.stringify({ inputs: run.inputs ?? {}, outputs: run.outputs ?? {} }, null, 2)}</pre>
      </Collapsible>
    </li>
  );
}

function Record({ projectId, view }: { projectId: string; view: IdentityTrainingView }) {
  const r = view.record;
  if (!r) return <p className="text-small text-text-muted">argus-mint has no training record for this identity version yet: no step has run.</p>;
  return (
    <div className="space-y-3">
      <p className="text-caption text-text-muted">
        Trained from {r.identity} v{r.identity_version} <Hash value={r.identity_hash} />, checked on the {r.metric} metric.
      </p>
      {r.candidates?.length ? (
        <div>
          <h5 className="text-caption text-text-muted">Candidates ({r.candidates.length})</h5>
          <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {r.candidates.map((c, i) => (
              <li key={c.n} className="text-caption">
                <img
                  src={trainingCandidate(projectId, view.identity, view.version, c.n)}
                  alt={`Candidate ${c.n}, seed ${c.seed}`}
                  width={c.request.width}
                  height={c.request.height}
                  loading={i === 0 ? undefined : "lazy"}
                  className="aspect-square w-full rounded bg-base-900 object-cover"
                />
                #{c.n} <Hash value={c.sha256} chars={6} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.failed?.length ? (
        <ul className="text-caption">
          {r.failed.map((f) => (
            <li key={f.n}>
              Candidate #{f.n} (seed {f.seed}): {f.error} {f.final ? "(refused every time: final)" : "(tried again when the step runs again)"}
            </li>
          ))}
        </ul>
      ) : null}
      {r.selection ? (
        <dl>
          <Kv label="Curator's scan">
            <code>{r.selection.scan_id}</code>, {r.selection.kept} kept
          </Kv>
          <Kv label="Training images">
            {r.selection.train.length}, in <code>{r.selection.train_export}</code>
          </Kv>
          <Kv label="Held-out references">
            {r.selection.held_out.length}, in <code>{r.selection.proof_export}</code>
          </Kv>
        </dl>
      ) : null}
      {r.captions?.length ? (
        <Collapsible title={`Captions (${r.captions.length})`}>
          <ul className="space-y-1 text-caption">
            {r.captions.map((c) => (
              <li key={c.file}>
                <code>{c.file}</code>: {c.text}
              </li>
            ))}
          </ul>
        </Collapsible>
      ) : null}
      {r.lora ? (
        <dl>
          <Kv label="LoRA">
            <code>{r.lora.name}</code> <Hash value={r.lora.sha256} />, trigger <code>{r.lora.trigger}</code>, forge run <code>{r.lora.forge_run}</code>
          </Kv>
        </dl>
      ) : null}
      {r.evaluation ? (
        <div className="text-small">
          <div className="flex flex-wrap items-center gap-2">
            Proof run <code>{r.evaluation.proof_run}</code>: <StatusBadge s={r.evaluation.pending ? PASS.pending : r.evaluation.passed ? PASS.passed : PASS.failed} />
            {r.evaluation.pending ? <span className="text-caption text-warning">waiting for a person&apos;s ratings in proof</span> : null}
          </div>
          <p className="text-caption text-text-secondary">
            {r.evaluation.metric}: {r.evaluation.score ?? "not scored"}
            {r.evaluation.min_score != null ? ` (at least ${r.evaluation.min_score})` : " (no minimum set)"}; proof&apos;s verdict{" "}
            {r.evaluation.proof_passed ? "passed" : "didn't pass"}.
          </p>
          {r.evaluation.reasons?.length ? (
            <ul className="list-disc pl-5 text-caption">
              {r.evaluation.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {r.pinned ? (
        <Notice tone="info">
          Pinned into identity v{r.pinned.identity_version} (a draft to review): {r.pinned.lora} <Hash value={r.pinned.sha256} />, proof run {r.pinned.proof_run}, export{" "}
          {r.pinned.proof_export}.
        </Notice>
      ) : null}
      {r.runs?.length ? (
        <Collapsible title={`Every run (${r.runs.length})`}>
          <ul>
            {r.runs.map((run) => (
              <RunLine key={run.job} run={run} />
            ))}
          </ul>
        </Collapsible>
      ) : null}
    </div>
  );
}

/** The panel on an embodied identity's file card. */
export function TrainingPanel({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const view = useLoad(() => getTraining(projectId, file.id, file.version), [projectId, file.id, file.version]);
  const off = useTrainingOff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The view as it stood when a step was started: until argus-mint's next answer replaces it, its `next` is the
  // step just started, so the button stays off rather than offer to start that step a second time.
  const [startedOn, setStartedOn] = useState<{ data: IdentityTrainingView | null; error: string | null } | null>(null);
  const v = view.data;
  const waiting = startedOn !== null && startedOn.data === view.data && startedOn.error === view.error;
  const live = Boolean(v && Object.values(v.steps).some((s) => s === "queued" || s === "running"));
  const { reload } = view;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [live, reload]);
  const lastRun = (step: string): StepRun | undefined => v?.record?.runs?.findLast((r) => r.step === step);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-small font-medium text-text-secondary">LoRA training</h4>
        <DocLink topic="training-steps">The steps</DocLink>
      </div>
      {view.error ? <Notice tone="error">{view.error}</Notice> : null}
      {!v && !view.error ? <Spinner /> : null}
      {v ? (
        <>
          <div tabIndex={0} role="region" aria-labelledby={`training-${file.id}-${file.version}`} className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <caption id={`training-${file.id}-${file.version}`} className="sr-only">
                Training steps of {file.id} v{file.version}
              </caption>
              <thead className="text-caption text-text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Step</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Last run</th>
                  <th scope="col" className="py-1 font-medium">Sibling ids</th>
                </tr>
              </thead>
              <tbody>
                {TRAINING_STEPS.map(({ step, who }) => {
                  const run = lastRun(step);
                  const state = v.steps[step];
                  return (
                    <tr key={step} className="border-t border-base-600/40 align-top">
                      <th scope="row" className="py-1 pr-3 font-normal">
                        <span className="font-mono">{step}</span>
                        <span className="block text-caption text-text-muted">{who}</span>
                      </th>
                      <td className="py-1 pr-3">{state ? <StatusBadge s={STEP_STATUS[state]} /> : <span className="text-text-muted">not reported</span>}</td>
                      <td className="py-1 pr-3 text-caption">
                        {run ? (
                          <>
                            {when(run.started_at)}
                            {run.finished_at ? ` to ${when(run.finished_at)}` : ""}
                            {run.error ? <span className="block text-error">{run.error}</span> : null}
                          </>
                        ) : (
                          <span className="text-text-muted">none</span>
                        )}
                      </td>
                      <td className="py-1 text-caption">
                        <Sibling ids={run?.sibling} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {v.next ? (
              <Button
                small
                tone="primary"
                disabled={Boolean(off) || busy || waiting}
                title={off ?? undefined}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await startTrainingStep(projectId, file.id, file.version, v.next!);
                    setStartedOn({ data: view.data, error: view.error });
                    reload();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Run {v.next}
              </Button>
            ) : (
              <p className="text-small text-text-muted">argus-mint allows no step to start now.</p>
            )}
            {busy || waiting ? <Spinner /> : null}
          </div>
          {off ? <p className="text-caption text-text-muted">{off}</p> : null}
          {error ? <Notice tone="error">argus-mint refused: {error}</Notice> : null}
          <Record projectId={projectId} view={v} />
        </>
      ) : null}
    </div>
  );
}
