/**
 * Build-time only (server): the ids the static demo exports a page for (the routes' page.static.tsx),
 * read from the tape in public/ (scripts/make_tape.mjs writes it before `make pages`). The live build
 * uses page.live.tsx instead and renders every id on demand, so it never reads the tape.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { catalogueRefParam } from "./catalogueRoute";
import { staticDemo, tapeBase } from "./demo";
import { parseTape, type Tape } from "./tape";

function tape(): Tape {
  return parseTape(JSON.parse(readFileSync(join(process.cwd(), "public", tapeBase(), "tape.json"), "utf8")));
}

export function draftParams(): { id: string }[] {
  return staticDemo() ? tape().drafts.map((d) => ({ id: d.id })) : [];
}

export function sampleParams(): { id: string }[] {
  return staticDemo() ? tape().samples.map((s) => ({ id: s.id })) : [];
}

/** `app/catalogue/[kind]/[...ref]`: a project's own frame (`<project>/<name>`) exports a page one level deeper. */
export function catalogueParams(): { kind: string; ref: string[] }[] {
  if (!staticDemo()) return [];
  const t = tape();
  return [
    ...t.templates.map((e) => ({ kind: "template", ref: catalogueRefParam(e.template.id, e.template.version) })),
    ...t.frames.map((e) => ({ kind: "frame", ref: catalogueRefParam(e.frame.id, e.frame.version) })),
    ...t.bios.map((e) => ({ kind: "bio", ref: catalogueRefParam(e.bio.id, e.bio.version) })),
  ];
}

/**
 * A static export refuses a dynamic route with no params, so a tape recorded before teaser projects
 * (none on it) still exports the neutral example's page, which then says the project isn't there.
 */
export function projectParams(): { id: string }[] {
  if (!staticDemo()) return [];
  const ids = tape().project_details.map((p) => ({ id: p.id }));
  return ids.length ? ids : [{ id: "example-teasers" }];
}
