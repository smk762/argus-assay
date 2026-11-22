/**
 * pack-argus-assay-c425648c30: a link into a project carries its id URL-encoded, as the page's own fetches do (lib/api.ts),
 * so a `#`, `?`, `%` or `/` in an id can't cut it short or name another route.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..");
const pages = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name))
  .map((e) => relative(src, join(e.parentPath, e.name)).split(sep).join("/"));

describe("links into a project", () => {
  it("encode the project's id", () => {
    for (const file of pages) {
      const raw = [...readFileSync(join(src, file), "utf8").matchAll(/`\/projects\/\$\{(?!encodeURIComponent\()[^}]*\}/g)].map((m) => m[0]);
      expect(raw, file).toEqual([]);
    }
  });
});
