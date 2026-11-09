"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import { useParams } from "next/navigation";
import { useState } from "react";

import { DraftBadge, Hash, INPUT, PageTitle, useLoad } from "@/components/bits";
import { CardEditor } from "@/components/CardEditor";
import { useMint } from "@/components/MintProvider";
import { Button, Card, Collapsible, Kv, Notice, SectionTitle, Spinner } from "@/components/ui";
import { draftImage, getDraft, getFrames, moderatorReview, ownerChallenge, ownerReview, publishDraft } from "@/lib/api";
import { awaitingText, canPublish, checkpointName, isAutoReview, loraText, moderatorCanReview, ownerCanReview, shortAddress } from "@/lib/status";
import { when } from "@/lib/time";
import type { DraftDetail } from "@/lib/types";
import { connectWallet, hasWallet, sameAddress, signMessage } from "@/lib/wallet";

const REVIEWER_KEY = "assay-reviewer";
const readReviewer = () => {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
};

function ModeratorPanel({ d, onDone }: { d: DraftDetail; onDone: (d: DraftDetail) => void }) {
  const { health, hasToken } = useMint();
  const [by, setBy] = useState(readReviewer);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!moderatorCanReview(d.status, d.awaiting)) return null;
  const off = !health?.capabilities.moderate ? "This server doesn't take moderator reviews." : !hasToken ? "Set the moderator token (key icon) to review." : null;
  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(REVIEWER_KEY, by);
      onDone(await moderatorReview(d.id, approve, by.trim(), note.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <SectionTitle className="mb-2">Moderator</SectionTitle>
      {off ? <p className="text-small text-text-muted">{off}</p> : null}
      <div className="space-y-2">
        <input className={INPUT} placeholder="Your name or id" value={by} onChange={(e) => setBy(e.target.value)} disabled={!!off} />
        <textarea className={INPUT} rows={2} placeholder="Note (say why, if rejecting)" value={note} onChange={(e) => setNote(e.target.value)} disabled={!!off} />
        <div className="flex gap-2">
          <Button tone="primary" disabled={!!off || busy || !by.trim()} onClick={() => decide(true)}>
            Approve image
          </Button>
          <Button tone="danger" disabled={!!off || busy || !by.trim()} onClick={() => decide(false)}>
            Reject
          </Button>
          {busy ? <Spinner /> : null}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Card>
  );
}

function OwnerPanel({ d, onDone }: { d: DraftDetail; onDone: (d: DraftDetail) => void }) {
  const { health } = useMint();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ownerCanReview(d.status, d.awaiting)) return null;
  const mock = Boolean((health as { mock?: boolean } | null)?.mock);
  const off = !health?.capabilities.owner_review ? "Owner review is off on this server (no SIWE domain)." : null;
  const decide = async (approve: boolean, demo = false) => {
    setBusy(true);
    setError(null);
    try {
      const challenge = await ownerChallenge(d.id, approve);
      let signature = "0xdemo";
      if (!demo) {
        const account = await connectWallet();
        if (!sameAddress(account, d.draft.to)) throw new Error(`Connect the wallet the card goes to (${shortAddress(d.draft.to)}), not ${shortAddress(account)}.`);
        signature = await signMessage(challenge.message, account);
      }
      onDone(await ownerReview(d.id, approve, challenge.message, signature, note.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <SectionTitle className="mb-2">Owner</SectionTitle>
      <p className="mb-2 text-small text-text-secondary">
        The owner, <code title={d.draft.to}>{shortAddress(d.draft.to)}</code>, approves by signing a message with that wallet. It names this draft,
        the decision and the image&apos;s hash, and works once.
      </p>
      {off ? <p className="text-small text-text-muted">{off}</p> : null}
      <textarea className={`${INPUT} mb-2`} rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} disabled={!!off} />
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" disabled={!!off || busy || (!hasWallet() && !mock)} onClick={() => decide(true)}>
          Approve with wallet
        </Button>
        <Button tone="danger" disabled={!!off || busy || (!hasWallet() && !mock)} onClick={() => decide(false)}>
          Reject with wallet
        </Button>
        {mock ? (
          <Button disabled={busy} onClick={() => decide(true, true)}>
            Approve as demo owner
          </Button>
        ) : null}
        {busy ? <Spinner /> : null}
      </div>
      {!hasWallet() && !mock ? <p className="mt-2 text-caption text-text-muted">No browser wallet found; the owner reviews from their own browser.</p> : null}
      {error ? <Notice tone="error" className="mt-2">{error}</Notice> : null}
    </Card>
  );
}

function PublishPanel({ d, onDone }: { d: DraftDetail; onDone: (d: DraftDetail) => void }) {
  const { health, hasToken } = useMint();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (d.published) {
    const p = d.published;
    return (
      <Card>
        <SectionTitle className="mb-2">Published</SectionTitle>
        <dl>
          <Kv label="Metadata">ipfs://{p.metadata_cid}</Kv>
          <Kv label="Image">ipfs://{String(p.render.image_cid)}</Kv>
          <Kv label="Signed by">{shortAddress(p.signer)}</Kv>
          <Kv label="Content hash"><Hash value={String(p.voucher.content_hash)} /></Kv>
          <Kv label="Voucher expires">{when(new Date(Number(p.voucher.deadline) * 1000).toISOString())}</Kv>
        </dl>
        <p className="mt-2 text-caption text-text-muted">
          The owner&apos;s wallet sends the voucher to the Card contract (<code>argus-mint submit</code>, or the consumer&apos;s app).
        </p>
        <Collapsible title="Voucher and signature">
          <pre className="overflow-x-auto text-caption">{JSON.stringify({ voucher: p.voucher, signature: p.signature }, null, 2)}</pre>
        </Collapsible>
      </Card>
    );
  }
  if (d.status !== "approved") return null;
  const off = !canPublish(d.status, health) ? "This server can't publish (no IPFS, signer or Card address)." : !hasToken ? "Set the moderator token to publish." : null;
  return (
    <Card>
      <SectionTitle className="mb-2">Publish</SectionTitle>
      <p className="mb-2 text-small text-text-secondary">Pins the art, the card image and the metadata to IPFS, and signs the mint voucher.</p>
      {off ? <p className="mb-2 text-small text-text-muted">{off}</p> : null}
      <Button
        tone="primary"
        disabled={!!off || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            onDone(await publishDraft(d.id));
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Pin and sign
      </Button>
      {error ? <Notice tone="error" className="mt-2">{error}</Notice> : null}
    </Card>
  );
}

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad(() => getDraft(id), [id]);
  const frames = useLoad(() => getFrames());
  const [updated, setUpdated] = useState<DraftDetail | null>(null);
  const [showArt, setShowArt] = useState(false);
  const [editing, setEditing] = useState(false);
  const { health } = useMint();
  const d = updated ?? data;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!d) return <Spinner />;
  const draft = d.draft;
  const framed = Boolean(draft.frame);
  const frameInfo = frames.data?.find((f) => f.frame.id === draft.frame?.id && f.frame.version === draft.frame?.version);
  return (
    <>
      <PageTitle aside={<DraftBadge status={d.status} />}>{draft.name}</PageTitle>
      {editing && frameInfo ? (
        <CardEditor
          key={draft.image_sha256}
          d={d}
          frame={frameInfo}
          onDone={(next) => {
            setUpdated(next);
            setShowArt(false);
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <img
            src={draftImage(d.id, showArt && framed ? "art" : "image", draft.image_sha256)}
            alt={showArt ? "The unframed render" : "The card image under review"}
            className="w-full rounded-lg border border-base-600/60 bg-base-900 object-contain"
          />
          {framed ? (
            <Button small onClick={() => setShowArt((v) => !v)}>
              {showArt ? "Show the card" : "Show the unframed render"}
            </Button>
          ) : null}
          <p className="text-caption text-text-muted">
            Reviewers judge this exact image: sha256 <Hash value={draft.image_sha256} chars={16} />.
          </p>
        </div>
        <div className="space-y-4">
          {d.awaiting.length && d.status === "pending" ? <Notice tone="warning">{awaitingText(d.awaiting)}.</Notice> : null}
          {draft.auto_check && draft.auto_check.image_sha256 === draft.image_sha256 ? (
            draft.auto_check.passed ? (
              <Notice tone="info">
                Auto-moderation approved this image for the moderator: {draft.auto_check.checks.join("; ")}. The owner judges quality.
              </Notice>
            ) : (
              <Notice tone="warning">Auto-moderation held this for a person: {(draft.auto_check.held ?? []).join("; ")}.</Notice>
            )
          ) : null}
          <ModeratorPanel d={d} onDone={setUpdated} />
          <OwnerPanel d={d} onDone={setUpdated} />
          <PublishPanel d={d} onDone={setUpdated} />
          {draft.frame && d.status !== "published" && health?.capabilities.edit_text && !editing ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <SectionTitle>Owner</SectionTitle>
                  <p className="text-small text-text-secondary">The owner can change the text and colours, then sign to bake a new image.</p>
                </div>
                <Button onClick={() => setEditing(true)} disabled={!frameInfo}>
                  Customise card
                </Button>
              </div>
            </Card>
          ) : null}
          {draft.reviews?.length ? (
            <Card>
              <SectionTitle className="mb-2">Reviews</SectionTitle>
              <ul className="space-y-2 text-small">
                {draft.reviews.map((r) => {
                  const current = r.image_sha256 === draft.image_sha256;
                  return (
                    <li key={`${r.role}-${r.at}`} className={current ? "" : "opacity-60"}>
                      <span className={r.decision === "approved" ? "text-success" : "text-error"}>{r.decision === "approved" ? "✓ Approved" : "✕ Rejected"}</span> by the{" "}
                      {r.role} ({r.role === "owner" ? shortAddress(r.by) : r.by}) · {when(r.at)}
                      {isAutoReview(r.by) ? <span className="ml-1 rounded border border-info/50 px-1 text-caption text-info">auto</span> : null}
                      {!current ? <span className="ml-1 text-caption text-text-muted">(an earlier version of the card)</span> : null}
                      {r.note ? <p className="text-text-secondary">“{r.note}”</p> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
          {draft.edits?.length ? (
            <Card>
              <SectionTitle className="mb-2">Edits</SectionTitle>
              <ul className="space-y-1 text-small">
                {draft.edits.map((e) => (
                  <li key={e.at}>
                    {e.fields.join(", ")} changed by the {e.role} ({e.role === "owner" ? shortAddress(e.by) : e.by}) · {when(e.at)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {draft.bio ? (
            <Card>
              <SectionTitle className="mb-2">Bio</SectionTitle>
              <p className="text-small italic">{draft.bio.text}</p>
              <p className="mt-2 text-caption text-text-muted">
                {draft.bio.edited
                  ? `Edited by hand after ${draft.bio.ref.model} wrote it; hand-written text reaches no model.`
                  : `Written by ${draft.bio.ref.model} from ${draft.bio.ref.id} v${draft.bio.ref.version} in ${draft.bio.attempts.length} attempt${draft.bio.attempts.length === 1 ? "" : "s"}; darkroom screened it before you saw it.`}
              </p>
              {draft.bio.attempts.length > 1 ? (
                <Collapsible title="Earlier attempts">
                  <ul className="space-y-1 text-caption">
                    {draft.bio.attempts.map((a, i) => (
                      <li key={i}>
                        <b>{String(a.outcome)}</b> {a.detail ? `(${String(a.detail)})` : ""}: {String(a.text)}
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              ) : null}
            </Card>
          ) : null}
          <Card>
            <SectionTitle className="mb-2">How it was made</SectionTitle>
            <dl>
              <Kv label="Template">
                {draft.request.template_id} v{draft.request.template_version} <Hash value={draft.request.template_hash} />
              </Kv>
              {draft.frame ? (
                <Kv label="Frame">
                  {draft.frame.id} v{draft.frame.version} <Hash value={draft.frame.hash} />
                </Kv>
              ) : null}
              <Kv label="Seed">{draft.request.seed}</Kv>
              <Kv label="Checkpoint" title={draft.request.model}>
                {checkpointName(draft.request.model)}
              </Kv>
              {draft.request.loras.length ? <Kv label="LoRAs">{loraText(draft.request.loras)}</Kv> : null}
              {draft.library ? <Kv label="Art">from the library: {draft.library}</Kv> : null}
              <Kv label="Render">
                {draft.renderer}, {draft.attempts.length} attempt{draft.attempts.length === 1 ? "" : "s"}
              </Kv>
              <Kv label="For">{draft.to}</Kv>
              <Kv label="Created">{when(draft.created_at)}</Kv>
              {Object.entries(draft.texts ?? {}).map(([slot, text]) => (
                <Kv key={slot} label={`Text: ${slot}`}>
                  {text}
                </Kv>
              ))}
            </dl>
            <p className="mt-2 text-small text-text-secondary">{draft.request.prompt}</p>
            <Collapsible title="Render attempts">
              <ul className="text-caption">
                {draft.attempts.map((a, i) => (
                  <li key={i}>
                    seed {String(a.seed)}: <b>{String(a.outcome)}</b> {a.ref ? `(${String(a.ref)})` : ""} {a.detail ? String(a.detail) : ""}
                  </li>
                ))}
              </ul>
            </Collapsible>
          </Card>
        </div>
      </div>
    </>
  );
}
