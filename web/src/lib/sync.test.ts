/**
 * The offline sync check (argus-assay#16, argus-studio#169's sync rule): the wire pin, the imported
 * docs and the recorded demo fixture all describe the same argus-mint commit. Fails `make check` when
 * they drift apart; `npm run wire:pull`, `make docs-pull` and a re-record (`make fixture` or
 * scripts/record_demo.py) put them back together. The scheduled drift check
 * (.github/workflows/mint-drift.yml) keeps that commit at mint's `dev` HEAD.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(__dirname, "..", "..");
const repo = join(web, "..");
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const pin = json<{ mint: { tag: string; version: string; docs?: Record<string, string> } }>(join(web, "schema", "pins.json")).mint;
const health = json<{ version: string }>(join(repo, "fixture", "health.json"));
const drafts = readdirSync(join(repo, "fixture", "drafts"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, json<{ draft: { made_with?: Record<string, string> } }>(join(repo, "fixture", "drafts", f))] as const);

describe("mint sync record", () => {
  it("pins a full commit sha with its package version", () => {
    expect(pin.tag).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("matches the version the demo fixture was recorded from", () => {
    expect(health.version, "fixture/health.json").toBe(pin.version);
    expect(drafts.length).toBeGreaterThan(0);
    for (const [file, d] of drafts) expect(d.draft.made_with?.["argus-mint"], `fixture/drafts/${file} made_with`).toBe(pin.version);
  });

  it("has imported docs that match their recorded hashes", () => {
    expect(Object.keys(pin.docs ?? {}).length).toBeGreaterThan(0);
    for (const [file, sha] of Object.entries(pin.docs ?? {})) {
      expect(createHash("sha256").update(readFileSync(join(web, "docs", "mint", file))).digest("hex"), file).toBe(sha);
    }
  });

  it("has no file under docs/mint/ that the sync record doesn't pin", () => {
    const dir = join(web, "docs", "mint");
    const files = existsSync(dir)
      ? readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
      : [];
    expect(files.sort()).toEqual(Object.keys(pin.docs ?? {}).sort());
  });
});
