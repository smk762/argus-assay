"use client";

/**
 * A teaser draft's own record (argus-mint docs/projects.md, Teaser drafts and Posting): the files it was made
 * from, each by id, version and hash; its background; how its identity got into the image; and its posts.
 * Shown as argus-mint recorded it.
 */
import Link from "next/link";

import { checkpointName, loraText, samplingText } from "@/lib/status";
import { when } from "@/lib/time";
import type { DraftDetail, Post, TeaserFile, TeaserRecord } from "@/lib/types";

import { DocLink, Hash } from "./bits";
import { Card, Collapsible, Kv, SectionTitle } from "./ui";

const LINK = "underline decoration-base-600 underline-offset-2 hover:text-text-secondary";

const PRESENCE: Record<TeaserRecord["presence"], string> = {
  embodied: "Embodied: the identity painted into the background",
  viewpoint: "Viewpoint: the background is the art, seen through the frame",
};

function FileRef({ f }: { f: TeaserFile }) {
  return (
    <>
      {f.id} v{f.version} <Hash value={f.hash} />
    </>
  );
}

/** What a teaser draft was made from, and how: in place of a card's template, seed and bio. */
export function TeaserMade({ d }: { d: DraftDetail }) {
  const draft = d.draft;
  const t = draft.teaser!;
  const req = draft.request;
  const inpaint = req.init_image ?? null;
  const project = encodeURIComponent(t.project.id);
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>How this teaser was made</SectionTitle>
        <DocLink topic="teaser-drafts">What a teaser draft records</DocLink>
      </div>
      <p className="mb-2 text-small text-text-secondary">
        Teaser <strong className="font-mono">{t.number}</strong> of{" "}
        <Link href={`/projects/${project}`} className={LINK}>
          {t.project.id}
        </Link>{" "}
        (<Link href={`/projects/${project}/tracker`} className={LINK}>tracker</Link>), made by argus-mint{draft.made_with?.["argus-mint"] ? ` ${draft.made_with["argus-mint"]}` : ""}
        {draft.made_with?.darkroom ? ` via darkroom ${draft.made_with.darkroom}` : ""}. Its text is the reviewed line&apos;s, so it isn&apos;t edited.
      </p>
      <dl>
        <Kv label="Project"><FileRef f={t.project} /></Kv>
        <Kv label="Teaser links"><FileRef f={t.links} /></Kv>
        <Kv label="Line"><FileRef f={t.line} /></Kv>
        <Kv label="Identity"><FileRef f={t.identity} /></Kv>
        <Kv label="Scene"><FileRef f={t.scene} /></Kv>
        {draft.frame ? (
          <Kv label="Frame">
            {draft.frame.id} v{draft.frame.version} <Hash value={draft.frame.hash} />
          </Kv>
        ) : null}
        <Kv label="Presence">{PRESENCE[t.presence] ?? t.presence}</Kv>
        <Kv label="Background">
          <Link href={`/projects/${project}#bg-${t.background.id}`} className={`font-mono ${LINK}`}>
            {t.background.id}
          </Link>{" "}
          <Hash value={t.background.sha256} />
        </Kv>
        <Kv label="Alt text">{t.alt}</Kv>
        {Object.entries(draft.texts ?? {}).map(([slot, text]) => (
          <Kv key={slot} label={`Text: ${slot}`}>
            {text}
          </Kv>
        ))}
        <Kv label="For">{draft.to}</Kv>
        <Kv label="Created">{when(draft.created_at)}</Kv>
      </dl>
      {inpaint ? (
        <>
          <h4 className="mt-3 text-caption text-text-muted">The inpainting request</h4>
          <dl>
            <Kv label="Checkpoint" title={req.model}>
              {checkpointName(req.model)}
            </Kv>
            <Kv label="LoRAs">{req.loras.length ? loraText(req.loras) : "none: the identity has no LoRA pinned and the project no style LoRA"}</Kv>
            {req.sampling ? <Kv label="Sampling">{samplingText(req.sampling)}</Kv> : null}
            <Kv label="Size">
              {req.width}×{req.height}
            </Kv>
            <Kv label="Seed">{req.seed}</Kv>
            <Kv label="Input image">
              <Hash value={inpaint.sha256} /> (the background)
            </Kv>
            {inpaint.mask_sha256 ? (
              <Kv label="Mask">
                <Hash value={inpaint.mask_sha256} /> (white over the scene&apos;s character area)
              </Kv>
            ) : null}
            <Kv label="Denoise">{inpaint.denoise}</Kv>
          </dl>
        </>
      ) : (
        <p className="mt-3 text-small text-text-secondary">Nothing was rendered for this teaser: the background is the art.</p>
      )}
      <Collapsible title={`Render attempts (${draft.attempts.length})`}>
        <ul className="text-caption">
          {draft.attempts.map((a, i) => (
            <li key={i}>
              seed {String(a.seed)}: <b>{String(a.outcome)}</b> {a.ref ? `(${String(a.ref)})` : ""} {a.detail ? String(a.detail) : ""}
            </li>
          ))}
        </ul>
      </Collapsible>
    </Card>
  );
}

/** Each post argus-herald (or the moderator) reported, as argus-mint recorded it. */
export function Posts({ posts }: { posts: Post[] }) {
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Posts</SectionTitle>
        <DocLink topic="posting">How posts are recorded</DocLink>
      </div>
      {posts.length ? (
        <ul className="space-y-2 text-small">
          {posts.map((p) => (
            <li key={`${p.where}|${p.url ?? ""}|${p.at}`}>
              <span className="font-medium">{p.where}</span>
              {p.url ? (
                <>
                  {" "}
                  {/* The poster's report, as sent: a link only when it is a web address, never another scheme. */}
                  {/^https?:\/\//i.test(p.url) ? (
                    <a href={p.url} rel="noopener noreferrer" className={`break-all ${LINK}`}>
                      {p.url}
                    </a>
                  ) : (
                    <code className="break-all">{p.url}</code>
                  )}
                </>
              ) : (
                <span className="text-text-muted"> (no URL)</span>
              )}
              <span className="block text-caption text-text-muted">
                Posted {when(p.at)}, reported by the {p.by} and recorded {when(p.recorded_at)}; sha256 of the bytes posted <Hash value={p.sha256} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">No post is recorded. Posting is optional; argus-herald reports each one it makes.</p>
      )}
    </Card>
  );
}
