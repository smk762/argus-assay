"use client";

/**
 * What argus-mint's platform checks found for a draft (`auto_check`), shown as recorded: the checks that
 * passed, what held it for a person, and, for a teaser, argus-proof's identity check with its numbers. The
 * page shows mint's outcome and adds no verdict of its own. Assay only shows `auto_check`; the one action
 * is asking argus-mint to run a pending teaser's identity check again.
 */
import { useState } from "react";

import { rerunIdentityCheck } from "@/lib/api";
import { IDENTITY_OUTCOME } from "@/lib/status";
import { when } from "@/lib/time";
import type { DraftDetail, IdentityCheck } from "@/lib/types";

import { DocLink, Hash, StatusBadge } from "./bits";
import { useMint } from "./MintProvider";
import { Button, Card, Kv, Notice, SectionTitle, Spinner } from "./ui";

function Identity({ c }: { c: IdentityCheck }) {
  return (
    <div className="mt-3 border-t border-base-600/40 pt-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="text-small font-medium text-text-secondary">Identity check (argus-proof)</h4>
        <StatusBadge s={IDENTITY_OUTCOME[c.outcome]} />
        <DocLink topic="identity-check">What each outcome means</DocLink>
      </div>
      <p className="mb-2 text-small">{c.reason}</p>
      <dl>
        <Kv label="Presence">{c.presence}</Kv>
        {c.metric ? <Kv label="Metric">{c.metric}</Kv> : null}
        <Kv label="Score">{c.score ?? "not scored"}</Kv>
        <Kv label="min_score">{c.min_score ?? "not set"}</Kv>
        {c.export ? (
          <Kv label="Against">
            <code>{c.export}</code>
          </Kv>
        ) : null}
        {c.crop ? (
          <Kv label="Crop">
            {c.crop.width}×{c.crop.height} at ({c.crop.x}, {c.crop.y})
          </Kv>
        ) : null}
        {c.scorer ? (
          <Kv label="Scorer">
            {c.scorer}
            {c.scorer_version ? ` ${c.scorer_version}` : ""}
            {c.proof_version ? `, proof wire ${c.proof_version}` : ""}
          </Kv>
        ) : null}
        {c.model_file ? (
          <Kv label="Weights">
            <code>{c.model_file.name}</code> <Hash value={c.model_file.sha256} />
          </Kv>
        ) : null}
        <Kv label="Art scored">
          <Hash value={c.art_sha256} />
        </Kv>
        <Kv label="Checked">{when(c.at)}</Kv>
      </dl>
    </div>
  );
}

function Rerun({ d, onDone }: { d: DraftDetail; onDone: (d: DraftDetail) => void }) {
  const { health, hasToken } = useMint();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = !health
    ? "Waiting for argus-mint."
    : !health.capabilities.identity_check
    ? "This server has no argus-proof to score with (identity_check is off)."
    : !health.capabilities.moderate
      ? "This server doesn't take moderator actions."
      : !hasToken
        ? "Set the moderator token (key icon) to run the check again."
        : null;
  return (
    <div className="mt-3 border-t border-base-600/40 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          small
          disabled={Boolean(off) || busy}
          title={off ?? undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              onDone(await rerunIdentityCheck(d.id));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Run the identity check again
        </Button>
        {busy ? <Spinner /> : null}
      </div>
      {off ? <p className="mt-1 text-caption text-text-muted">{off}</p> : null}
      {error ? (
        <Notice tone="error" className="mt-2">
          argus-mint refused: {error}
        </Notice>
      ) : null}
    </div>
  );
}

export function AutoCheckPanel({ d, onDone }: { d: DraftDetail; onDone: (d: DraftDetail) => void }) {
  const a = d.draft.auto_check;
  const teaser = d.draft.kind === "teaser";
  if (!a) return null;
  const current = a.image_sha256 === d.draft.image_sha256;
  return (
    <Card className={current ? "" : "opacity-70"}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Platform checks</SectionTitle>
        <DocLink topic="review">Who approves what</DocLink>
      </div>
      {!current ? <p className="mb-2 text-caption text-text-muted">For an earlier image of this draft; the current one hasn&apos;t been checked.</p> : null}
      {a.passed ? (
        <Notice tone="info">Auto-moderation approved this image for the moderator. The owner judges quality.</Notice>
      ) : (
        <Notice tone="warning">Held for a person: {(a.held ?? []).length ? (a.held ?? []).join("; ") : "argus-mint gave no reason"}.</Notice>
      )}
      <h4 className="mt-2 text-caption text-text-muted">Checks that passed</h4>
      {a.checks.length ? (
        <ul className="list-disc pl-5 text-small">
          {a.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">none</p>
      )}
      <p className="mt-1 text-caption text-text-muted">Checked {when(a.at)}.</p>
      {a.identity ? <Identity c={a.identity} /> : null}
      {teaser && d.status === "pending" ? <Rerun d={d} onDone={onDone} /> : null}
    </Card>
  );
}
