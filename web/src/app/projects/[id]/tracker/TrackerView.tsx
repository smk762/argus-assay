"use client";

/**
 * A teaser project's tracker (argus-mint docs/projects.md, The tracker): one row per teaser of the newest
 * approved links, with argus-mint's stages, chosen background and drafts. Every stage and status is
 * argus-mint's; nothing is counted or worked out here. Below it, the moderator makes a teaser draft.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

import { DocLink, DraftBadge, Field, INPUT, PageTitle, StatusBadge, useLoad } from "@/components/bits";
import { useMint } from "@/components/MintProvider";
import { Button, Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { getProject, getTracker, makeTeaserDraft } from "@/lib/api";
import { staticDemo } from "@/lib/demo";
import { projectFile } from "@/lib/projects";
import { awaitingText, STAGE_STATUS, STAGES } from "@/lib/status";
import { when } from "@/lib/time";
import type { DraftDetail, ProjectTracker } from "@/lib/types";

const LINK = "underline decoration-base-600 underline-offset-2 hover:text-text-secondary";

/** Why the moderator can't make a teaser draft here, or null. */
function useTeasersOff(): string | null {
  const { health, hasToken } = useMint();
  if (!health) return "Waiting for argus-mint.";
  if (!health.capabilities.teasers) {
    return staticDemo()
      ? "This demo shows the recorded teaser drafts; making one needs a running argus-mint (and darkroom, for an embodied identity)."
      : "This server can't make teaser drafts (no moderator token is set on it, or it is read-only).";
  }
  return hasToken ? null : "Set the moderator token (key icon) to make a teaser draft.";
}

function TrackerTable({ projectId, tracker }: { projectId: string; tracker: ProjectTracker }) {
  return (
    <div tabIndex={0} role="region" aria-labelledby="tracker-caption" className="overflow-x-auto rounded-lg border border-base-600/60">
      <table className="w-full text-left text-small">
        <caption id="tracker-caption" className="px-3 py-2 text-left text-caption text-text-muted">
          Each teaser of the teaser links v{tracker.links_version}, with the stages argus-mint reports.
        </caption>
        <thead className="bg-base-800 text-caption text-text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Teaser
            </th>
            {STAGES.map((s) => (
              <th key={s.key} scope="col" className="px-3 py-2 font-medium" title={`Reached when ${s.means}`}>
                {s.title}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-medium">
              Background
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Drafts, newest first
            </th>
          </tr>
        </thead>
        <tbody>
          {tracker.teasers.map((t) => (
            <tr key={t.number} className="border-t border-base-600/40 align-top">
              <th scope="row" className="px-3 py-2 font-mono font-semibold">
                {t.number}
              </th>
              {STAGES.map((s) => (
                <td key={s.key} className="px-3 py-2">
                  <StatusBadge s={t.stages[s.key] ? STAGE_STATUS.reached : STAGE_STATUS.not_yet} />
                </td>
              ))}
              <td className="px-3 py-2">
                {t.background ? (
                  <Link href={`/projects/${encodeURIComponent(projectId)}#bg-${t.background}`} className={`whitespace-nowrap font-mono ${LINK}`}>
                    {t.background}
                  </Link>
                ) : (
                  <span className="text-text-muted">not chosen yet</span>
                )}
              </td>
              <td className="px-3 py-2">
                {t.drafts.length ? (
                  <ul className="space-y-1.5">
                    {t.drafts.map((d) => (
                      <li key={d.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/drafts/${encodeURIComponent(d.id)}`} className={`font-mono ${LINK}`}>
                            {d.id}
                          </Link>
                          <DraftBadge status={d.status} />
                        </div>
                        <p className="text-caption text-text-muted">
                          {when(d.created_at)}, from links v{d.links_version} and {d.background}.{" "}
                          {d.current ? "Made from the current files." : "Made from other files than the current links name."}
                          {d.awaiting.length && d.status === "pending" ? ` ${awaitingText(d.awaiting)}.` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-text-muted">none yet</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The moderator makes a teaser draft from T<n> for an owner's wallet. A refusal is argus-mint's message, word for word. */
function MakeDraft({ projectId, tracker, onMade }: { projectId: string; tracker: ProjectTracker; onMade: () => void }) {
  const off = useTeasersOff();
  const [number, setNumber] = useState(tracker.teasers[0]?.number ?? "");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<DraftDetail | null>(null);
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Make a teaser draft</SectionTitle>
        <DocLink topic="teaser-drafts">What a teaser draft needs</DocLink>
      </div>
      <p className="mb-3 text-small text-text-secondary">
        From one teaser of the newest approved links. argus-mint refuses unless every file it links, its frame and its background are approved
        and SingGuard has passed every text. The draft is then reviewed like a card: the moderator, then the owner with this wallet.
      </p>
      {off ? <p className="mb-2 text-small text-text-muted">{off}</p> : null}
      <form
        className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setMade(null);
          try {
            setMade(await makeTeaserDraft(projectId, number, to.trim()));
            onMade();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Teaser">
          <select className={INPUT} required value={number} onChange={(e) => setNumber(e.target.value)} disabled={Boolean(off)}>
            {tracker.teasers.map((t) => (
              <option key={t.number} value={t.number}>
                {t.number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner's wallet" hint="The teaser is minted to this address, if it is minted, and this wallet approves it.">
          <input
            className={INPUT}
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x…"
            pattern="^0x[0-9a-fA-F]{40}$"
            autoComplete="off"
            spellCheck={false}
            disabled={Boolean(off)}
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" tone="primary" disabled={Boolean(off) || busy || !number}>
            Make draft
          </Button>
          {busy ? <Spinner /> : null}
        </div>
      </form>
      {error ? (
        <Notice tone="error" className="mt-3">
          argus-mint refused: {error}
        </Notice>
      ) : null}
      {made ? (
        <Notice tone="info" className="mt-3">
          Made <Link href={`/drafts/${encodeURIComponent(made.id)}`} className={LINK}>{made.draft.name}</Link>; it is in the review queue.
        </Notice>
      ) : null}
    </Card>
  );
}

function Tracker() {
  const { id } = useParams<{ id: string }>();
  const tracker = useLoad(() => getTracker(id), [id]);
  const project = useLoad(() => getProject(id), [id]);
  const own = project.data ? projectFile(project.data) : undefined;
  const title = own ? String(own.doc.title ?? id) : id;
  return (
    <>
      <p className="mb-1 text-caption">
        <Link href={`/projects/${encodeURIComponent(id)}`} className="text-text-muted hover:text-text-secondary">
          ← {title}
        </Link>
      </p>
      <PageTitle aside={<DocLink topic="tracker">What each stage means</DocLink>}>
        Tracker <span className="text-small font-normal text-text-muted">({id})</span>
      </PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Where each teaser stands, as argus-mint reports it: quote final, concept chosen, image made, posted and minted. Posting and minting are
        each optional. A teaser&apos;s drafts link to their review.
      </p>
      {tracker.error ? <Notice tone="error">{tracker.error}</Notice> : null}
      {!tracker.data && !tracker.error ? <Spinner /> : null}
      {tracker.data ? (
        <div className="space-y-6">
          {tracker.data.links_version === null ? (
            <Notice tone="warning">This project has no approved teaser links yet, so argus-mint tracks no teaser.</Notice>
          ) : (
            <TrackerTable projectId={id} tracker={tracker.data} />
          )}
          {tracker.data.teasers.length ? <MakeDraft projectId={id} tracker={tracker.data} onMade={tracker.reload} /> : null}
        </div>
      ) : null}
    </>
  );
}

export default function TrackerView() {
  return (
    <Suspense fallback={<Spinner />}>
      <Tracker />
    </Suspense>
  );
}
