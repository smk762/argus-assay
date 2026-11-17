// @vitest-environment jsdom
// pack-argus-assay-d5c18a58cd: Safari's light-dismiss fallback closes only the dialog that was pressed, never
// a parent Modal when you click in (or around) a nested one.
// A Lightbox whose list shrinks under it clears the page's index (pack-argus-assay-2c3300883a: already so, through
// Modal: `open` turns false, Modal closes the dialog, and its close event calls onIndex(null)).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Lightbox } from "./Lightbox";
import { Modal } from "./Modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom has no showModal/close and no closedBy, so Modal takes Safari's fallback path, which is what's tested.
  const proto = HTMLDialogElement.prototype as unknown as { showModal(): void; close(): void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(node));
  return el;
}

const rect = (left: number, top: number, right: number, bottom: number) =>
  ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect;

function press(target: Element, x: number, y: number) {
  for (const type of ["pointerdown", "pointerup"]) target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

describe("Modal's light-dismiss fallback", () => {
  it("closes on a press outside its own box", () => {
    const onClose = vi.fn();
    const el = mount(
      <Modal open onClose={onClose} label="outer" lightDismiss>
        <p>hi</p>
      </Modal>,
    );
    const dialog = el.querySelector("dialog")!;
    dialog.getBoundingClientRect = () => rect(100, 100, 300, 300);
    press(dialog, 10, 10); // its backdrop: the dialog is the target, outside its box
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves a parent Modal open when the press is in or around a nested one", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const el = mount(
      <Modal open onClose={outerClose} label="outer" lightDismiss>
        <Modal open onClose={innerClose} label="inner" lightDismiss>
          <button type="button">inside</button>
        </Modal>
      </Modal>,
    );
    const [outer, inner] = [...el.querySelectorAll("dialog")];
    outer.getBoundingClientRect = () => rect(100, 100, 300, 300);
    inner.getBoundingClientRect = () => rect(400, 400, 600, 600);
    press(inner.querySelector("button")!, 500, 500); // inside the nested dialog, outside the parent's box
    expect(outerClose).not.toHaveBeenCalled();
    expect(innerClose).not.toHaveBeenCalled();
    press(inner, 700, 700); // the nested dialog's backdrop: it closes, the parent stays
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });
});

describe("Lightbox", () => {
  it("clears the index when the open item falls off the end of a shrinking list", () => {
    const onIndex = vi.fn();
    const items = ["a", "b", "c"].map((k) => ({ key: k, src: `${k}.png`, alt: k }));
    const el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    act(() => root!.render(<Lightbox items={items} index={2} onIndex={onIndex} label="Card" />));
    expect(onIndex).not.toHaveBeenCalled();
    act(() => root!.render(<Lightbox items={items.slice(0, 2)} index={2} onIndex={onIndex} label="Card" />));
    expect(onIndex).toHaveBeenCalledWith(null);
  });
});
