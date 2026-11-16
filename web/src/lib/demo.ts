/**
 * The static demo build (`ASSAY_STATIC=1`, `make pages`): a pure static export that replays a
 * data tape (scripts/make_tape.mjs, from fixture/) instead of calling argus-mint.
 *
 * Both reads are literal `process.env.NEXT_PUBLIC_*` expressions on purpose: Next inlines them at
 * build time, so the live build never carries the tape code paths. next.config.ts maps
 * ASSAY_STATIC=1 onto NEXT_PUBLIC_ASSAY_STATIC.
 */
export function staticDemo(): boolean {
  return process.env.NEXT_PUBLIC_ASSAY_STATIC === "1";
}

/** Where the tape is served from: a path on this site (default `/data-tape`). */
export function tapeBase(): string {
  return (process.env.NEXT_PUBLIC_ASSAY_TAPE_URL || "/data-tape").replace(/\/+$/, "");
}

export const REPO_URL = "https://github.com/smk762/argus-assay";
export const MINT_REPO_URL = "https://github.com/smk762/argus-mint";
export const MINT_PYPI_URL = "https://pypi.org/project/argus-mint/";

/** Why a control the demo keeps is off. Controls with nothing to show are hidden instead. */
export const OFF = {
  create: "Making a draft renders on a GPU (or picks from a server's library): it needs a running argus-mint.",
  sample: "Samples render on a GPU: they need a running argus-mint.",
} as const;

/** Thrown by the in-browser argus-mint for anything that needs the real server. */
export class NotInDemo extends Error {
  constructor(what: string) {
    super(`${what} is not in this demo: it needs a running argus-mint.`);
    this.name = "NotInDemo";
  }
}
