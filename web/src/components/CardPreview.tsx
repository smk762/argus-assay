"use client";

import { useEffect, useState } from "react";

import { frameFont, frameOverlay } from "@/lib/api";
import { svgMatrix, type CardStyle } from "@/lib/style";
import type { FrameInfo, FrameLayout } from "@/lib/types";

const familyOf = (frameId: string, version: number, font: string) => `assay-${frameId}-${version}-${font.replace(/[^a-zA-Z0-9]/g, "-")}`;

/** Load the frame's fonts once, so the preview's text is set in the faces argus-mint bakes with. */
function useFrameFonts(frame: FrameInfo["frame"]): boolean {
  const fonts = Array.from(new Set(Object.values(frame.texts ?? {}).map((s) => s.font).filter(Boolean) as string[]));
  const key = fonts.join("|");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(
      fonts.map(async (font) => {
        const family = familyOf(frame.id, frame.version, font);
        if ([...document.fonts].some((f) => f.family === family)) return;
        const face = new FontFace(family, `url(${frameFont(frame.id, frame.version, font)})`);
        document.fonts.add(await face.load());
      }),
    ).then(
      () => live && setReady(true),
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id, frame.version, key]);
  return ready;
}

/**
 * The card as argus-mint will bake it, drawn live: the art in the window, the overlay through
 * the same tint matrix, slot backgrounds, then each line where Pillow puts it (from /layout).
 * Close, not byte-identical: the baked PNG is what's reviewed.
 */
export function CardPreview({ frame, artUrl, layout, style }: { frame: FrameInfo; artUrl: string; layout: FrameLayout | null; style: CardStyle }) {
  const f = frame.frame;
  const fontsReady = useFrameFonts(f);
  const W = frame.width;
  const H = frame.height;
  const slots = style.slots ?? {};
  const uid = `${f.id}-${f.version}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-[repeating-conic-gradient(#8884_0_25%,transparent_0_50%)] bg-[length:16px_16px]" role="img" aria-label="Preview of the styled card">
      <defs>
        <filter id={`tint-${uid}`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={svgMatrix(style.tint)} />
        </filter>
        {Object.entries(layout?.slots ?? {}).map(([slot, l]) => (
          <filter key={slot} id={`glow-${uid}-${slot}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation={l.effects.glow} />
          </filter>
        ))}
      </defs>
      <image href={artUrl} x={f.window.x} y={f.window.y} width={f.window.width} height={f.window.height} preserveAspectRatio="xMidYMid slice" />
      <image href={frameOverlay(f.id, f.version)} x={0} y={0} width={W} height={H} filter={style.tint ? `url(#tint-${uid})` : undefined} />
      {Object.entries(slots).map(([slot, s]) => {
        const box = f.texts?.[slot];
        const bg = s.background;
        if (!box || !bg) return null;
        const pad = bg.padding ?? 4;
        return (
          <rect
            key={slot}
            x={box.x - pad}
            y={box.y - pad}
            width={box.width + 2 * pad}
            height={box.height + 2 * pad}
            rx={bg.radius ?? 8}
            fill={bg.colour}
            fillOpacity={bg.opacity ?? 0.6}
          />
        );
      })}
      {fontsReady
        ? Object.entries(layout?.slots ?? {}).map(([slot, l]) => {
            const box = f.texts?.[slot];
            const s = slots[slot] ?? {};
            const colour = s.colour ?? box?.colour ?? "#000000";
            const effect = s.effect ?? "none";
            const fx = s.effect_colour ?? "#000000";
            const family = l.font ? familyOf(f.id, f.version, l.font) : "sans-serif";
            const common = { fontFamily: family, fontSize: l.size, style: { whiteSpace: "pre" as const } };
            return (
              <g key={slot}>
                {l.lines.map((line, i) => {
                  const y = line.y + l.ascent;
                  return (
                    <g key={i}>
                      {effect === "glow" ? (
                        <text x={line.x} y={y} {...common} fill={fx} stroke={fx} strokeWidth={2 * l.effects.outline} filter={`url(#glow-${uid}-${slot})`}>
                          {line.text}
                        </text>
                      ) : null}
                      {effect === "shadow" ? (
                        <text x={line.x + l.effects.shadow} y={y + l.effects.shadow} {...common} fill={fx}>
                          {line.text}
                        </text>
                      ) : null}
                      <text
                        x={line.x}
                        y={y}
                        {...common}
                        fill={colour}
                        {...(effect === "outline" ? { stroke: fx, strokeWidth: 2 * l.effects.outline, paintOrder: "stroke", strokeLinejoin: "round" as const } : {})}
                      >
                        {line.text}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })
        : null}
    </svg>
  );
}
