"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Field, INPUT, PageTitle, useLoad } from "@/components/bits";
import { LibraryPicker } from "@/components/LibraryPicker";
import { useMint } from "@/components/MintProvider";
import { Card, Kv, Notice, SectionTitle, Spinner } from "@/components/ui";
import { createDraft, getBios, getFrames, getLibrary, getTemplates, libraryImage } from "@/lib/api";
import { displaySlots } from "@/lib/slots";
import { allowedModels, checkpointName, draftSources } from "@/lib/status";

type Source = "render" | "library";

const key = (id: string, v: number) => `${id}@${v}`;
const ref = (k: string) => (k ? { id: k.split("@")[0], version: Number(k.split("@")[1]) } : null);
const fill = (prompt: string, values: Record<string, string>) => prompt.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? k);

/** `?library=<id>` preselects a library entry, and reading the query needs a Suspense boundary. */
export default function NewDraft() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewDraftForm />
    </Suspense>
  );
}

/**
 * A card from approved files only. The art is rendered now, or taken from the pre-rendered library
 * where the server has one. Every variable is chosen from its fixed list: there is no free-text prompt.
 */
function NewDraftForm() {
  const router = useRouter();
  const asked = useSearchParams().get("library");
  const { health, hasToken } = useMint();
  const sources = draftSources(health);
  const all = useLoad(() => Promise.all([getTemplates(), getFrames(), getBios()]));
  const lib = useLoad(() => (sources.library ? getLibrary() : Promise.resolve(null)), [sources.library]);
  const [templates, frames, bios] = all.data ?? [[], [], []];
  const approvedT = templates.filter((t) => t.template.status === "approved");
  const approvedF = frames.filter((f) => f.frame.status === "approved");
  const approvedB = bios.filter((b) => b.bio.status === "approved");
  const [chosen, setChosen] = useState<Source | null>(null);
  const [picked, setPicked] = useState<string | null>(asked);
  const [template, setTemplate] = useState("");
  const [frame, setFrame] = useState("");
  const [bio, setBio] = useState("");
  const [model, setModel] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [to, setTo] = useState("");
  const [asset, setAsset] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until someone chooses: the library when a link named an entry, or when nothing can be rendered here.
  const source: Source = sources.library && (chosen === "library" || (chosen === null && (Boolean(asked) || !sources.render))) ? "library" : "render";
  const entry = source === "library" ? (lib.data?.items.find((i) => i.id === picked) ?? null) : null;
  const libKey = lib.data ? key(lib.data.template.id, lib.data.template.version) : "";
  const hasKey = (k: string) => approvedT.some((x) => key(x.template.id, x.template.version) === k);
  const firstKey = approvedT[0] ? key(approvedT[0].template.id, approvedT[0].template.version) : "";
  const tKey = template || (source === "library" && hasKey(libKey) ? libKey : firstKey);
  const t = approvedT.find((x) => key(x.template.id, x.template.version) === tKey)?.template;
  const f = approvedF.find((x) => key(x.frame.id, x.frame.version) === frame)?.frame;
  const models = t ? allowedModels(t) : [];
  const modelValue = models.slice(1).includes(model) ? model : "";
  const values: Record<string, string> = Object.fromEntries(Object.entries(t?.variables ?? {}).map(([k, list]) => [k, vars[k] ?? list[0]]));
  const biosOff = !health?.capabilities.write_bios;
  const off = !health?.capabilities.create_drafts
    ? "This server can't create drafts (it is read-only, or has neither darkroom nor a library)."
    : !hasToken
      ? "Set the moderator token (key icon) to create drafts."
      : source === "render" && !sources.render
        ? "Rendering needs darkroom, which this server doesn't have."
        : source === "library" && !entry
          ? "Pick a portrait from the library."
          : null;
  if (all.error) return <Notice tone="error">{all.error}</Notice>;
  if (!all.data) return <Spinner />;
  return (
    <>
      <PageTitle>New draft</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Makes a card from approved files into a draft for review. Nothing is pinned or signed until the moderator and the owner have both
        approved the image. Rendering and the bio take about half a minute{sources.library ? "; a library portrait is already rendered" : ""}.
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
              // A library entry brings its own variables, seed and checkpoint: argus-mint takes them from the entry.
              ...(entry ? { library: entry.id } : { variables: values, seed, model: modelValue || null }),
              asset: asset.trim() || `${name.trim().toLowerCase().replace(/\W+/g, "-")}-${entry ? entry.seed : seed}`,
              to: to.trim(),
              name: name.trim(),
              frame: ref(frame),
              bio: biosOff ? null : ref(bio),
              texts: Object.fromEntries(Object.entries(texts).filter(([, v]) => v)),
            });
            router.push(`/drafts/${d.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        {sources.library ? (
          <fieldset>
            <legend className="mb-1 text-small font-medium text-text-secondary">Art</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["render", "Render now", sources.render ? "A new image from darkroom, in about half a minute." : "Needs darkroom, which this server doesn't have."],
                  ["library", "From the library", "A pre-rendered portrait. No GPU needed."],
                ] as const
              ).map(([value, label, hint]) => {
                const disabled = value === "render" && !sources.render;
                return (
                  <label
                    key={value}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-small ${source === value ? "border-interactive" : "border-base-600"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <input type="radio" name="source" className="mt-1" checked={source === value} disabled={disabled} onChange={() => setChosen(value)} />
                    <span>
                      <span className="block font-medium text-text-primary">{label}</span>
                      <span className="block text-caption text-text-muted">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
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
          <Field label="Bio template" hint={biosOff ? "This server can't write bios (that needs darkroom and a writer)." : undefined}>
            <select className={INPUT} value={biosOff ? "" : bio} onChange={(e) => setBio(e.target.value)} disabled={biosOff}>
              <option value="">No bio</option>
              {approvedB.map((x) => (
                <option key={key(x.bio.id, x.bio.version)} value={key(x.bio.id, x.bio.version)}>
                  {x.bio.id} v{x.bio.version} ({x.bio.model})
                </option>
              ))}
            </select>
          </Field>
        </Card>
        {source === "library" ? (
          <Card>
            <SectionTitle className="mb-2">Portrait</SectionTitle>
            {lib.error ? (
              <Notice tone="error">{lib.error}</Notice>
            ) : !lib.data ? (
              <Spinner />
            ) : (
              <>
                {tKey && tKey !== libKey ? (
                  <Notice tone="warning" className="mb-3">
                    The library was rendered from {lib.data.template.id} v{lib.data.template.version}. argus-mint refuses an entry that the chosen
                    template wouldn&apos;t render exactly.
                  </Notice>
                ) : null}
                {picked && !entry ? (
                  <Notice tone="warning" className="mb-3">
                    The library has no entry {picked}. Pick another.
                  </Notice>
                ) : null}
                <LibraryPicker library={lib.data} selected={entry?.id ?? null} onSelect={setPicked} />
                {entry ? (
                  <div className="mt-4 grid gap-4 border-t border-base-600/60 pt-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                    <img src={libraryImage(entry.id, 640)} alt={`The chosen portrait: ${Object.values(entry.variables).join(", ")}`} className="w-full rounded-md bg-base-900" />
                    <div>
                      <p className="mb-1 text-small text-text-secondary">The entry fixes the variables, seed and checkpoint.</p>
                      <dl>
                        <Kv label="Entry">{entry.id}</Kv>
                        <Kv label="Checkpoint" title={entry.model}>
                          {checkpointName(entry.model)}
                        </Kv>
                        <Kv label="Seed">{entry.seed}</Kv>
                        {Object.entries(entry.variables).map(([k, v]) => (
                          <Kv key={k} label={k}>
                            {v}
                          </Kv>
                        ))}
                      </dl>
                      {t ? <p className="mt-3 text-caption text-text-muted">Prompt: {fill(t.prompt, entry.variables)}</p> : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        ) : t ? (
          <Card>
            <SectionTitle className="mb-2">Variables</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Checkpoint">
                <select className={INPUT} value={modelValue} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m, i) => (
                    <option key={m} value={i === 0 ? "" : m} title={m}>
                      {checkpointName(m)}
                      {i === 0 ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
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
            <p className="mt-3 text-caption text-text-muted">Prompt: {fill(t.prompt, values)}</p>
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
          {source === "render" ? (
            <Field label="Seed">
              <input type="number" min={0} className={INPUT} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
            </Field>
          ) : null}
          {displaySlots(f).map((slot) => (
            <Field key={slot} label={`Text: ${slot}`} hint="Display text from your records. Shown on the card, not stored as stats.">
              <input className={INPUT} value={texts[slot] ?? ""} onChange={(e) => setTexts({ ...texts, [slot]: e.target.value })} />
            </Field>
          ))}
        </Card>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!!off || busy || !t} className="rounded-md bg-interactive px-3.5 py-2 text-small font-medium text-white hover:bg-interactive-hover disabled:opacity-50">
            {source === "library" ? "Create draft" : "Render draft"}
          </button>
          {busy ? (
            <>
              <Spinner /> <span className="text-small text-text-muted">{source === "library" ? "Making the card…" : "Rendering…"}</span>
            </>
          ) : null}
          {off ? <span className="text-small text-text-muted">{off}</span> : null}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </>
  );
}
