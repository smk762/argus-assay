"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native modal `<dialog>`, opened with showModal(). The browser gives it the top layer, an inert
 * page behind it, focus containment, Esc (and the back gesture) to close, and focus back to the
 * control that opened it. Don't add role="dialog", aria-modal or a focus trap.
 *
 * `open` drives it; every way of closing (Esc, a button, a click outside with `lightDismiss`) ends
 * in the `close` event, which calls `onClose`. Children render only while open. Put
 * `data-autofocus` on the control that should take focus.
 */
export function Modal({
  open,
  onClose,
  label,
  lightDismiss = false,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Also close on a click outside the dialog (`closedby="any"`). */
  lightDismiss?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const closed = () => onCloseRef.current();
    dialog.addEventListener("close", closed);
    // closedby="any" is missing in Safari: close on a press and release both outside the box.
    // Test the pointer position, not the target: the dialog is also the target for its own padding. But only for
    // a press on this dialog: a nested Modal renders inside it, so its presses (and its backdrop's) bubble up
    // here, and natively only the topmost dialog is light-dismissed.
    let pressedOutside = false;
    const outside = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("dialog") !== dialog) return false;
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const down = (e: PointerEvent) => {
      pressedOutside = outside(e);
    };
    const up = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) dialog.close();
    };
    const fallback = lightDismiss && !("closedBy" in HTMLDialogElement.prototype);
    if (fallback) {
      dialog.addEventListener("pointerdown", down);
      dialog.addEventListener("pointerup", up);
    }
    return () => {
      dialog.removeEventListener("close", closed);
      if (fallback) {
        dialog.removeEventListener("pointerdown", down);
        dialog.removeEventListener("pointerup", up);
      }
    };
  }, [lightDismiss]);

  return (
    <dialog ref={ref} aria-label={label} {...({ closedby: lightDismiss ? "any" : "closerequest" } as object)} className={`modal ${className}`}>
      {open ? children : null}
    </dialog>
  );
}
