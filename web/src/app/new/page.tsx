"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, INPUT, PageTitle, useLoad } from "@/components/bits";
import { useMint } from "@/components/MintProvider";
import { Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { createDraft, getBios, getFrames, getTemplates } from "@/lib/api";
import { displaySlots } from "@/lib/slots";

const key = (id: string, v: number) => `${id}@${v}`;
const ref = (k: string) => (k ? { id: k.split("@")[0], version: Number(k.split("@")[1]) } : null);

/** A card from approved files only. Every variable is chosen from its fixed list: there is no free-text prompt. */
export default function NewDraft() {
  const router = useRouter();
  const { health, hasToken } = useMint();
  const all = useLoad(() => Promise.all([getTemplates(), getFrames(), getBios()]));
  const [templates, frames, bios] = all.data ?? [[], [], []];
  const approvedT = templates.filter((t) => t.template.status === "approved");
  const approvedF = frames.filter((f) => f.frame.status === "approved");
  const approvedB = bios.filter((b) => b.bio.status === "approved");
  const [template, setTemplate] = useState("");
  const [frame, setFrame] = useState("");
  const [bio, setBio] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [to, setTo] = useState("");
  const [asset, setAsset] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tKey = template || (approvedT[0] ? key(approvedT[0].template.id, approvedT[0].template.version) : "");
  const t = approvedT.find((x) => key(x.template.id, x.template.version) === tKey)?.template;
  const f = approvedF.find((x) => key(x.frame.id, x.frame.version) === frame)?.frame;
  const values: Record<string, string> = Object.fromEntries(Object.entries(t?.variables ?? {}).map(([k, list]) => [k, vars[k] ?? list[0]]));
  const off = !health?.capabilities.create_drafts ? "This server can't create drafts (no darkroom, or read-only)." : !hasToken ? "Set the moderator token (key icon) to create drafts." : null;
  if (all.error) return <Notice tone="error">{all.error}</Notice>;
  if (!all.data) return <Spinner />;
  return (
    <>
      <PageTitle>New draft</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Renders a card from approved files into a draft for review. Nothing is pinned or signed until the moderator and the owner have both
        approved the image. Rendering and the bio take about half a minute.
      </p>
      {approvedT.length === 0 ? <Notice tone="warning" className="mb-4">No approved template yet. Approve one in the catalogue first.</Notice> : null}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const d = await createDraft({
              template: ref(tKey)!,
              variables: values,
              seed,
              asset: asset.trim() || `${name.trim().toLowerCase().replace(/\W+/g, "-")}-${seed}`,
              to: to.trim(),
              name: name.trim(),
              frame: ref(frame),
              bio: ref(bio),
              texts: Object.fromEntries(Object.entries(texts).filter(([, v]) => v)),
            });
            router.push(`/drafts/${d.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <Card className="grid gap-3 sm:grid-cols-3">
          <Field label="Template">
            <select className={INPUT} value={tKey} onChange={(e) => setTemplate(e.target.value)}>
              {approvedT.map((x) => (
                <option key={key(x.template.id, x.template.version)} value={key(x.template.id, x.template.version)}>
                  {x.template.id} v{x.template.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Frame">
            <select className={INPUT} value={frame} onChange={(e) => setFrame(e.target.value)}>
              <option value="">None</option>
              {approvedF.map((x) => (
                <option key={key(x.frame.id, x.frame.version)} value={key(x.frame.id, x.frame.version)}>
                  {x.frame.id} v{x.frame.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bio template">
            <select className={INPUT} value={bio} onChange={(e) => setBio(e.target.value)}>
              <option value="">No bio</option>
              {approvedB.map((x) => (
                <option key={key(x.bio.id, x.bio.version)} value={key(x.bio.id, x.bio.version)}>
                  {x.bio.id} v{x.bio.version} ({x.bio.model})
                </option>
              ))}
            </select>
          </Field>
        </Card>
        {t ? (
          <Card>
            <SectionTitle className="mb-2">Variables</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(t.variables).map(([v, list]) => (
                <Field key={v} label={v}>
                  <select className={INPUT} value={values[v]} onChange={(e) => setVars({ ...vars, [v]: e.target.value })}>
                    {list.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <p className="mt-3 text-caption text-text-muted">Prompt: {t.prompt.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? k)}</p>
          </Card>
        ) : null}
        <Card className="grid gap-3 sm:grid-cols-2">
          <Field label="Card name" hint="Shown on the card and in its metadata; never sent to a model.">
            <input className={INPUT} required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Owner's wallet" hint="The card is minted to this address, and this wallet approves it.">
            <input className={INPUT} required value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" pattern="^0x[0-9a-fA-F]{40}$" />
          </Field>
          <Field label="Asset key" hint="One card per asset, ever. Default: name and seed.">
            <input className={INPUT} value={asset} onChange={(e) => setAsset(e.target.value)} />
          </Field>
          <Field label="Seed">
            <input type="number" min={0} className={INPUT} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </Field>
          {displaySlots(f).map((slot) => (
            <Field key={slot} label={`Text: ${slot}`} hint="Display text from your records. Shown on the card, not stored as stats.">
              <input className={INPUT} value={texts[slot] ?? ""} onChange={(e) => setTexts({ ...texts, [slot]: e.target.value })} />
            </Field>
          ))}
        </Card>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!!off || busy || !t} className="rounded-md bg-interactive px-3.5 py-2 text-small font-medium text-white hover:bg-interactive-hover disabled:opacity-50">
            Render draft
          </button>
          {busy ? (
            <>
              <Spinner /> <span className="text-small text-text-muted">Rendering…</span>
            </>
          ) : null}
          {off ? <span className="text-small text-text-muted">{off}</span> : null}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </>
  );
}
