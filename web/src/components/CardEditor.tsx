"use client";

import { useEffect, useState } from "react";

import { draftImage, frameLayout, ownerEdit, ownerEditChallenge } from "@/lib/api";
import { diffEdit, shortAddress } from "@/lib/status";
import { normalise, sameStyle, type CardStyle, type Effect, type SlotStyle } from "@/lib/style";
import type { DraftDetail, FrameInfo, FrameLayout } from "@/lib/types";
import { connectWallet, hasWallet, sameAddress, signMessage } from "@/lib/wallet";

import { Field, INPUT } from "./bits";
import { CardPreview } from "./CardPreview";
import { ColorWheel } from "./ColorWheel";
import { useMint } from "./MintProvider";
import { Button, Card, Notice, SectionTitle, Spinner } from "./ui";

type Target = "border" | string;
type ColourField = "tint" | "text" | "effect" | "background";

const EFFECTS: { key: Effect; label: string }[] = [
  { key: "none", label: "None" },
  { key: "shadow", label: "Shadow" },
  { key: "outline", label: "Outline" },
  { key: "glow", label: "Glow" },
];

/**
 * The owner customises their card: its text and its look. The preview is live SVG; confirming
 * signs one edit with the card's wallet, and argus-mint bakes the PNG that is then reviewed.
 */
export function CardEditor({ d, frame, onDone, onClose }: { d: DraftDetail; frame: FrameInfo; onDone: (d: DraftDetail) => void; onClose: () => void }) {
  const { health } = useMint();
  const draft = d.draft;
  const f = frame.frame;
  const slotNames = Object.keys(f.texts ?? {});
  const displaySlots = slotNames.filter((s) => s !== "name" && s !== "bio");
  const [name, setName] = useState(draft.name);
  const [bio, setBio] = useState(draft.bio?.text ?? "");
  const [texts, setTexts] = useState<Record<string, string>>({ ...(draft.texts ?? {}) });
  const [style, setStyle] = useState<CardStyle>(() => structuredClone(draft.style ?? { slots: {} }));
  const [target, setTarget] = useState<Target>("border");
  const [field, setField] = useState<ColourField>("tint");
  const [layout, setLayout] = useState<FrameLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mock = Boolean((health as { mock?: boolean } | null)?.mock);
  const locked = Boolean((f as { style_locked?: boolean }).style_locked);

  // Ask argus-mint where the text goes whenever it changes (Pillow decides the wrap and the size).
  const layoutTexts: Record<string, string> = Object.fromEntries(
    Object.entries({ name, ...(draft.bio ? { bio } : {}), ...texts }).filter(([k, v]) => v && slotNames.includes(k)),
  );
  const layoutKey = JSON.stringify(layoutTexts);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      frameLayout(f.id, f.version, JSON.parse(layoutKey) as Record<string, string>).then(
        (l) => live && setLayout(l),
        (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [f.id, f.version, layoutKey]);

  const slot: SlotStyle = target === "border" ? {} : (style.slots?.[target] ?? {});
  const setSlot = (next: SlotStyle) => setStyle({ ...style, slots: { ...(style.slots ?? {}), [target]: next } });
  const fields: { key: ColourField; label: string; value: string | null }[] =
    target === "border"
      ? [{ key: "tint", label: "Border tint", value: style.tint?.colour ?? null }]
      : [
          { key: "text", label: "Text", value: slot.colour ?? null },
          ...(slot.effect && slot.effect !== "none" ? [{ key: "effect" as const, label: "Effect", value: slot.effect_colour ?? "#000000" }] : []),
          ...(slot.background ? [{ key: "background" as const, label: "Background", value: slot.background.colour }] : []),
        ];
  const active = fields.find((x) => x.key === field) ?? fields[0];
  const wheelValue = active?.value ?? (target === "border" ? "#7a3cc8" : (f.texts?.[target]?.colour ?? "#000000"));
  const setColour = (hex: string) => {
    if (!active || active.key === "tint") setStyle({ ...style, tint: { colour: hex, strength: style.tint?.strength ?? 0.6 } });
    else if (active.key === "text") setSlot({ ...slot, colour: hex });
    else if (active.key === "effect") setSlot({ ...slot, effect_colour: hex });
    else if (slot.background) setSlot({ ...slot, background: { ...slot.background, colour: hex } });
  };

  const textEdit = diffEdit({ name: draft.name, bio: draft.bio?.text ?? null, texts: draft.texts ?? {} }, { name, bio: draft.bio ? bio : null, texts });
  const styleChanged = !sameStyle(draft.style, style);
  const edit = textEdit || styleChanged ? { ...(textEdit ?? {}), ...(styleChanged ? { style: normalise(style) } : {}) } : null;

  const bake = async (demo: boolean) => {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await ownerEditChallenge(d.id, edit);
      let signature = "0xdemo";
      if (!demo) {
        const account = await connectWallet();
        if (!sameAddress(account, draft.to)) throw new Error(`Connect the card's wallet (${shortAddress(draft.to)}), not ${shortAddress(account)}.`);
        signature = await signMessage(challenge.message, account);
      }
      onDone(await ownerEdit(d.id, edit, challenge.message, signature));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const slider = (label: string, value: number, min: number, max: number, step: number, set: (v: number) => void) => (
    <label className="block text-small">
      <span className="flex justify-between text-text-secondary">
        {label} <span className="text-text-muted">{value}</span>
      </span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );

  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Customise your card</SectionTitle>
        <span className="text-caption text-text-muted">Live preview. Your colours, your call. Nothing changes until you sign.</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <CardPreview frame={frame} artUrl={draftImage(d.id, "art", draft.art_sha256)} layout={layout} style={normalise(style)} />
          <p className="text-caption text-text-muted">
            argus-mint bakes the final image from these settings; the moderator and you then review that image.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Field label="Name">
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            {draft.bio ? (
              <Field label="Bio">
                <textarea className={INPUT} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
              </Field>
            ) : null}
            {displaySlots.map((s) => (
              <Field key={s} label={`Text: ${s}`}>
                <input className={INPUT} value={texts[s] ?? ""} onChange={(e) => setTexts({ ...texts, [s]: e.target.value })} />
              </Field>
            ))}
          </div>

          {locked ? (
            <Notice tone="info">This frame&apos;s look is fixed; only the text can change.</Notice>
          ) : (
            <div>
              <div role="tablist" aria-label="What to style" className="mb-3 flex flex-wrap gap-1">
                {["border", ...slotNames].map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={target === t}
                    onClick={() => {
                      setTarget(t);
                      setField(t === "border" ? "tint" : "text");
                    }}
                    className={`rounded-md px-2.5 py-1 text-small capitalize ${target === t ? "bg-interactive text-white" : "bg-base-700 text-text-secondary hover:bg-base-600"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-6">
                <ColorWheel value={wheelValue} onChange={setColour} />
                <div className="min-w-48 flex-1 space-y-3">
                  {fields.length > 1 ? (
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Which colour the wheel sets">
                      {fields.map((x) => (
                        <button
                          key={x.key}
                          role="radio"
                          aria-checked={active?.key === x.key}
                          onClick={() => setField(x.key)}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-caption ${active?.key === x.key ? "border-interactive" : "border-base-600"}`}
                        >
                          <span className="h-3 w-3 rounded-sm border border-base-600" style={{ background: x.value ?? "transparent" }} />
                          {x.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {target === "border" ? (
                    <>
                      <label className="flex items-center gap-2 text-small">
                        <input
                          type="checkbox"
                          checked={Boolean(style.tint)}
                          onChange={(e) => setStyle({ ...style, tint: e.target.checked ? { colour: wheelValue, strength: 0.6 } : null })}
                        />
                        Tint the border
                      </label>
                      {style.tint
                        ? slider("Strength", style.tint.strength ?? 0.6, 0, 1, 0.05, (v) => setStyle({ ...style, tint: { ...style.tint!, strength: v } }))
                        : null}
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-small">
                        <input
                          type="checkbox"
                          checked={Boolean(slot.colour)}
                          onChange={(e) => setSlot({ ...slot, colour: e.target.checked ? wheelValue : null })}
                        />
                        Own text colour (else the frame&apos;s)
                      </label>
                      <Field label="Effect">
                        <select
                          className={INPUT}
                          value={slot.effect ?? "none"}
                          onChange={(e) => {
                            setSlot({ ...slot, effect: e.target.value as Effect });
                            if (e.target.value !== "none") setField("effect");
                          }}
                        >
                          {EFFECTS.map((x) => (
                            <option key={x.key} value={x.key}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-2 text-small">
                        <input
                          type="checkbox"
                          checked={Boolean(slot.background)}
                          onChange={(e) => {
                            setSlot({ ...slot, background: e.target.checked ? { colour: "#000000", opacity: 0.6, radius: 8, padding: 4 } : null });
                            if (e.target.checked) setField("background");
                          }}
                        />
                        Background behind the text
                      </label>
                      {slot.background ? (
                        <>
                          {slider("Opacity", slot.background.opacity ?? 0.6, 0, 1, 0.05, (v) => setSlot({ ...slot, background: { ...slot.background!, opacity: v } }))}
                          {slider("Corner radius", slot.background.radius ?? 8, 0, 60, 1, (v) => setSlot({ ...slot, background: { ...slot.background!, radius: v } }))}
                          {slider("Padding", slot.background.padding ?? 4, 0, 30, 1, (v) => setSlot({ ...slot, background: { ...slot.background!, padding: v } }))}
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-base-600/60 pt-3">
            <Button tone="primary" disabled={busy || !edit || (!hasWallet() && !mock)} onClick={() => bake(false)}>
              Sign with wallet and bake
            </Button>
            {mock ? (
              <Button disabled={busy || !edit} onClick={() => bake(true)}>
                Bake as demo owner
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => setStyle({ slots: {} })}>
              Plain style
            </Button>
            <Button disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            {busy ? <Spinner /> : null}
            {!edit ? <span className="text-caption text-text-muted">Nothing changed yet.</span> : null}
          </div>
          <p className="text-caption text-text-muted">
            Only the card&apos;s owner ({shortAddress(draft.to)}) can sign. A new image needs the moderator and you to approve it again.
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      </div>
    </Card>
  );
}
