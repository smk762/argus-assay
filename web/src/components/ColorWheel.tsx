"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { hexToHsv, hsvToHex, isHex } from "@/lib/style";

import { INPUT } from "./bits";

/**
 * Hue around the wheel, saturation out from the centre, brightness on the slider below.
 * With the keyboard: the arrow keys on the wheel, the slider, or the hex field.
 * Every colour is reachable, black included: the owner's call.
 */
export function ColorWheel({ value, onChange, size = 180 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // The parent changed the colour (another field, a reset): follow it.
    setSeen(value);
    setHsv(hexToHsv(value));
    setText(value);
  }
  const emit = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setText(hex);
    setSeen(hex);
    onChange(hex);
  };
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (box.width / 2));
    emit({ h, s, v: hsv.v || 1 });
  };
  // Left and right turn the hue, up and down move the saturation; Shift takes finer steps.
  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    const fine = e.shiftKey ? 1 : 5;
    const move: Record<string, [number, number]> = { ArrowRight: [fine, 0], ArrowLeft: [-fine, 0], ArrowUp: [0, fine / 100], ArrowDown: [0, -fine / 100] };
    const by = move[e.key];
    if (!by) return;
    e.preventDefault();
    emit({ h: (hsv.h + by[0] + 360) % 360, s: Math.max(0, Math.min(1, hsv.s + by[1])), v: hsv.v || 1 });
  };
  const angle = (hsv.h * Math.PI) / 180;
  const r = (hsv.s * size) / 2;
  return (
    <div className="space-y-2" style={{ width: size }}>
      <div
        ref={ref}
        role="slider"
        aria-label="Hue and saturation"
        aria-valuetext={text}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        className="relative cursor-crosshair touch-none rounded-full"
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle closest-side, #fff, transparent), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
        onKeyDown={nudge}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: size / 2 + r * Math.sin(angle), top: size / 2 - r * Math.cos(angle), background: text }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={hsv.v}
        aria-label="Brightness"
        className="w-full"
        style={{ accentColor: hsvToHex(hsv.h, hsv.s, 1) }}
        onChange={(e) => emit({ ...hsv, v: Number(e.target.value) })}
      />
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded border border-base-600" style={{ background: text }} />
        <input
          className={`${INPUT} font-mono`}
          value={text}
          aria-label="Colour as hex"
          onChange={(e) => {
            setText(e.target.value);
            if (isHex(e.target.value)) {
              setHsv(hexToHsv(e.target.value));
              setSeen(e.target.value.toLowerCase());
              onChange(e.target.value.toLowerCase());
            }
          }}
        />
      </div>
    </div>
  );
}
