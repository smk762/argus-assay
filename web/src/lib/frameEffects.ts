/**
 * A frame's `effects` (argus-mint wire 1.17): lens, scanlines, noise, colour fringing and vignette, applied by
 * argus-mint to the art inside the window when it bakes the PNG. The SVG preview (components/CardPreview.tsx) can't
 * draw them, so wherever it previews such a frame it says so, as argus-mint's docs/catalogue.md asks. The notice
 * follows the frame's `effects` field alone: nothing about the image is worked out here.
 */
import type { Frame } from "./types";

export type FrameEffect = NonNullable<Frame["effects"]>[number];

/** The notice, word for word (argus-mint docs/catalogue.md "Effects"). */
export const EFFECTS_NOT_PREVIEWED = "effects not previewed: the baked PNG is what's reviewed";

/** Whether the SVG preview of `frame` must carry the notice: its `effects` list isn't empty. */
export const effectsNotPreviewed = (frame: Pick<Frame, "effects">): boolean => (frame.effects?.length ?? 0) > 0;

const NAMES: Record<FrameEffect["type"], string> = {
  barrel: "lens bulge",
  scanlines: "scanlines",
  noise: "noise",
  chromatic_aberration: "colour fringing",
  vignette: "vignette",
};

/** One effect as recorded, for the frame's record: its name, then each parameter as argus-mint wrote it. */
export function effectText(e: FrameEffect): string {
  const params = Object.entries(e)
    .filter(([k]) => k !== "type")
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(", ");
  return `${NAMES[e.type] ?? e.type} (${e.type}${params ? `: ${params}` : ""})`;
}
