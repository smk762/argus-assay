"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import type { KeyboardEvent, ReactNode } from "react";

import { keyStep, step } from "@/lib/step";

import { Modal } from "./Modal";

export type LightboxItem = { key: string; src: string; alt: string; caption?: ReactNode; actions?: ReactNode };

const CONTROL = "rounded-md bg-white/10 px-3 py-1.5 text-small text-white hover:bg-white/20";

/**
 * One image of a list, enlarged in a modal, with Previous and Next: buttons and the arrow keys.
 * It wraps at both ends, so the buttons are never disabled and keep keyboard focus (a disabled
 * button would drop it to the page behind). `items` is the list as the page shows it (its current
 * filter); `index` is the open one, or null when closed.
 */
export function Lightbox({ items, index, onIndex, label }: { items: LightboxItem[]; index: number | null; onIndex: (i: number | null) => void; label: string }) {
  const open = index !== null && index < items.length;
  const item = open ? items[index] : null;
  const go = (by: number) => index !== null && onIndex(step(index, by, items.length));
  const onKeyDown = (e: KeyboardEvent) => {
    const by = keyStep(e);
    if (!by || items.length < 2) return;
    e.preventDefault();
    go(by);
  };
  return (
    <Modal open={open} onClose={() => onIndex(null)} label={label} lightDismiss className="w-[calc(100%-2rem)] max-w-5xl backdrop:bg-black/95">
      {item ? (
        <figure className="space-y-2" onKeyDown={onKeyDown}>
          <img key={item.key} src={item.src} alt={item.alt} className="mx-auto max-h-[75dvh] rounded-lg object-contain" />
          <figcaption className="space-y-2 rounded-lg bg-black p-2 text-small text-white">
            {item.caption ? <div>{item.caption}</div> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {items.length > 1 ? (
                  <>
                    <button type="button" onClick={() => go(-1)} className={CONTROL} aria-label="Previous" aria-keyshortcuts="ArrowLeft">
                      ← Prev
                    </button>
                    <button type="button" onClick={() => go(1)} className={CONTROL} aria-label="Next" aria-keyshortcuts="ArrowRight" data-autofocus>
                      Next →
                    </button>
                  </>
                ) : null}
                <span aria-live="polite" className="text-caption text-white/80">
                  {index! + 1} of {items.length}
                </span>
              </div>
              <span className="flex flex-wrap items-center gap-3">
                {item.actions}
                <button type="button" onClick={() => onIndex(null)} className="underline" {...(items.length > 1 ? {} : { "data-autofocus": true })}>
                  Close
                </button>
              </span>
            </div>
          </figcaption>
        </figure>
      ) : null}
    </Modal>
  );
}
