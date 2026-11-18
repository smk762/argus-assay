/**
 * The catalogue page of one file: `/catalogue/<kind>/<id>/<version>`. A project's own frame has a two-part id
 * (`<project>/<name>`, argus-mint wire 1.16), so the route is a catch-all (`app/catalogue/[kind]/[...ref]`): the
 * last segment is the version and the rest, joined by `/`, the id. Global ids have no `/`, so their URLs are unchanged.
 */
export type CatalogueKindName = "template" | "frame" | "bio";

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const catalogueHref = (kind: CatalogueKindName, id: string, version: number): string =>
  `/catalogue/${kind}/${id.split("/").map(encodeURIComponent).join("/")}/${version}`;

/** The id and version a catch-all `ref` names, or null when it names none (a frame's id may have two parts). */
export function parseCatalogueRef(kind: string, ref: string[] | string | undefined): { id: string; version: number } | null {
  // A segment may arrive encoded, its `/` as `%2F` too: decode, then split.
  const parts = (Array.isArray(ref) ? ref : ref ? [ref] : []).flatMap((p) => {
    try {
      return decodeURIComponent(p).split("/");
    } catch {
      return [""];
    }
  });
  if (parts.length < 2) return null;
  const version = Number(parts.at(-1));
  const idParts = parts.slice(0, -1);
  if (!Number.isInteger(version) || version < 1 || !/^\d+$/.test(parts.at(-1)!)) return null;
  if (idParts.length > (kind === "frame" ? 2 : 1) || !idParts.every((p) => SEGMENT.test(p))) return null;
  return { id: idParts.join("/"), version };
}

/** The static export's params for one file: the id's parts, then the version. */
export const catalogueRefParam = (id: string, version: number): string[] => [...id.split("/"), String(version)];
