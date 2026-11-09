"use client";

import { useState } from "react";

import { moderatorEdit, ownerEdit, ownerEditChallenge } from "@/lib/api";
import { diffEdit, shortAddress } from "@/lib/status";
import type { DraftDetail, FrameInfo } from "@/lib/types";
import { connectWallet, hasWallet, sameAddress, signMessage } from "@/lib/wallet";

import { Field, INPUT } from "./bits";
import { useMint } from "./MintProvider";
import { Button, Card, Notice, SectionTitle, Spinner } from "./ui";

/**
 * Change a framed card's text. argus-mint redraws it on the same art; the new image needs the
 * moderator's and the owner's approval again. Hand-written text never reaches a model.
 */
export function EditPanel({ d, frame, onDone }: { d: DraftDetail; frame: FrameInfo | undefined; onDone: (d: DraftDetail) => void }) {
  const { health, hasToken } = useMint();
  const draft = d.draft;
  const slots = Object.keys(frame?.frame.texts ?? {}).filter((s) => s !== "name" && s !== "bio");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(draft.name);
  const [bio, setBio] = useState(draft.bio?.text ?? "");
  const [texts, setTexts] = useState<Record<string, string>>({ ...(draft.texts ?? {}) });
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!draft.frame || d.status === "published" || !health?.capabilities.edit_text) return null;
  const mock = Boolean((health as { mock?: boolean }).mock);
  const edit = diffEdit(
    { name: draft.name, bio: draft.bio?.text ?? null, texts: draft.texts ?? {} },
    { name, bio: draft.bio ? bio : null, texts },
  );
  const run = async (fn: () => Promise<DraftDetail>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const asOwner = (demo: boolean) =>
    run(async () => {
      const challenge = await ownerEditChallenge(d.id, edit!);
      let signature = "0xdemo";
      if (!demo) {
        const account = await connectWallet();
        if (!sameAddress(account, draft.to)) throw new Error(`Connect the card's wallet (${shortAddress(draft.to)}), not ${shortAddress(account)}.`);
        signature = await signMessage(challenge.message, account);
      }
      return ownerEdit(d.id, edit!, challenge.message, signature);
    });
  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Card text</SectionTitle>
          <Button small onClick={() => setOpen(true)}>
            Edit text
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <SectionTitle className="mb-2">Edit card text</SectionTitle>
      <p className="mb-3 text-small text-text-secondary">
        The card is redrawn on the same art, so the new image needs the moderator and the owner to approve it again. Your text is never sent to
        a model; with auto-moderation on, it goes through the word filter.
      </p>
      <div className="space-y-2">
        <Field label="Name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        {draft.bio ? (
          <Field label="Bio">
            <textarea className={INPUT} rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
          </Field>
        ) : null}
        {slots.map((slot) => (
          <Field key={slot} label={`Text: ${slot}`} hint="Empty clears the slot.">
            <input className={INPUT} value={texts[slot] ?? ""} onChange={(e) => setTexts({ ...texts, [slot]: e.target.value })} />
          </Field>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input className={`${INPUT} max-w-44`} placeholder="Moderator name" value={by} onChange={(e) => setBy(e.target.value)} />
          <Button tone="primary" disabled={busy || !edit || !hasToken || !by.trim()} onClick={() => run(() => moderatorEdit(d.id, edit!, by.trim()))}>
            Save as moderator
          </Button>
          <Button disabled={busy || !edit || (!hasWallet() && !mock)} onClick={() => asOwner(false)}>
            Save as owner (wallet)
          </Button>
          {mock ? (
            <Button disabled={busy || !edit} onClick={() => asOwner(true)}>
              Save as demo owner
            </Button>
          ) : null}
          <Button disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {busy ? <Spinner /> : null}
        </div>
        {!edit ? <p className="text-caption text-text-muted">Nothing changed yet.</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Card>
  );
}
