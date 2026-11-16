/**
 * Checks for CLAUDE.md's "Must never happen" table (argus-assay#40). Most read the source rather
 * than a list of names, so a new writer, dialog, token use or status render is covered without
 * anyone remembering to add it here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOGUE_STATUS, DRAFT_STATUS, SAMPLE_STATUS } from "./status";
import { getToken, setToken } from "./token";
import type { CreateDraft, SampleRequest } from "./types";

const src = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(src, rel), "utf8");
const sources = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.parentPath.includes(`${sep}generated`))
  .map((e) => relative(src, join(e.parentPath, e.name)).split(sep).join("/"));

/** Each top-level `export` in a module, by name, with its text up to the next top-level declaration. */
function exportsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const decl = /^export (?:async )?(?:function|const) (\w+)/gm;
  const starts = [...text.matchAll(decl)];
  const ends = [...text.matchAll(/^(?:export |function |async function |const |let |type |interface )/gm)].map((m) => m.index);
  for (const m of starts) {
    const end = ends.find((i) => i > m.index) ?? text.length;
    out.set(m[1], text.slice(m.index, end));
  }
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe("every write is gated on /health before it reaches the wire (rule 2)", () => {
  const api = read("lib/api.ts");
  const fns = exportsOf(api);
  const POST = /\bpost(?:<[^>]*>)?\(|method: "(?:POST|PUT|PATCH|DELETE)"/;
  // POSTs that compute a picture or a layout for the page and change nothing on the server.
  const PREVIEWS = new Set(["frameLayout", "previewFrame"]);
  // Everything else that posts is a write: the moderator's (token) and the owner's (signed) alike.
  const writers = [...fns].filter(([name, body]) => POST.test(body) && !PREVIEWS.has(name));

  it("finds the writers", () => {
    expect(writers.map(([name]) => name)).toEqual(
      expect.arrayContaining(["createDraft", "decide", "moderatorReview", "ownerChallenge", "ownerReview", "ownerEditChallenge", "ownerEdit", "publishDraft", "startSamples"]),
    );
  });

  it("calls requireCapability before each one posts", () => {
    for (const [name, body] of writers) {
      const gate = body.indexOf("await requireCapability(");
      expect(gate, `${name} posts without requireCapability`).toBeGreaterThanOrEqual(0);
      expect(gate, `${name} posts before requireCapability`).toBeLessThan(body.search(POST));
    }
  });

  it("leaves no request to argus-mint outside api.ts", () => {
    for (const file of sources.filter((f) => f !== "lib/api.ts")) {
      expect(read(file), `${file} sends a write itself`).not.toMatch(/method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
      expect(read(file), `${file} calls fetch itself`).not.toMatch(/\bfetch\(\s*`\$\{mintUrl\(\)/);
    }
  });
});

describe("the moderator token stays in the tab (rule 4)", () => {
  it("is kept in sessionStorage, never localStorage", () => {
    const session = new Map<string, string>();
    const local = new Map<string, string>();
    const storage = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
    vi.stubGlobal("sessionStorage", storage(session));
    vi.stubGlobal("localStorage", storage(local));
    setToken("secret");
    expect(getToken()).toBe("secret");
    expect([...session.values()]).toEqual(["secret"]);
    expect(local.size).toBe(0);
    setToken("");
    expect(session.size).toBe(0);
  });

  it("is read only by the token module's callers, and sent only as an Authorization header", () => {
    expect(read("lib/token.ts")).not.toMatch(/localStorage\.\w+\(|document\.cookie/);
    const readers = sources.filter((f) => f !== "lib/token.ts" && /\bgetToken\(/.test(read(f)));
    expect(readers.sort()).toEqual(["components/MintProvider.tsx", "components/TokenDialog.tsx", "lib/api.ts"]);
    const api = read("lib/api.ts");
    expect(api.match(/\bgetToken\(\)/g)).toHaveLength(1);
    expect(api).toMatch(/const token = auth \? getToken\(\) : "";\s*if \(token\) out\.Authorization = `Bearer \$\{token\}`;/);
    for (const file of sources) expect(read(file), file).not.toMatch(/[?&]token=/i);
  });

  it("can't come from the bundle", () => {
    for (const file of sources) expect(read(file), file).not.toMatch(/NEXT_PUBLIC_\w*(?:TOKEN|SECRET|KEY)\b/);
    expect(readFileSync(join(src, "..", "next.config.ts"), "utf8")).not.toMatch(/TOKEN/);
  });
});

describe("no free-text prompts (rule 3)", () => {
  it("has no prompt field to send in a draft or a sample request", () => {
    // tsc fails here if argus-mint's wire ever grows one: then the UI must not fill it from a text box.
    const draftHasNone: "prompt" | "negative" | "negative_prompt" extends keyof CreateDraft ? false : true = true;
    const sampleHasNone: "prompt" | "negative" | "negative_prompt" extends keyof SampleRequest ? false : true = true;
    expect([draftHasNone, sampleHasNone]).toEqual([true, true]);
  });

  it("picks every template variable from a list, never a text box", () => {
    for (const file of ["app/new/page.tsx", "components/Catalogue.tsx"]) {
      const text = read(file);
      // A variable's value is only ever set from a <select> of the template's list: no text field names one.
      for (const m of text.matchAll(/<(input|textarea)\b[^>]*>/g)) expect(m[0], `${file}: ${m[0].slice(0, 80)}`).not.toMatch(/variable|prompt/i);
    }
  });
});

describe("a status has a mark and a word (rule 7)", () => {
  it("defines both for every status the wire has", () => {
    for (const map of [DRAFT_STATUS, CATALOGUE_STATUS, SAMPLE_STATUS]) {
      for (const [status, s] of Object.entries(map)) {
        expect(s.mark.trim(), status).not.toBe("");
        expect(s.label.trim(), status).not.toBe("");
      }
    }
  });

  it("never renders a bare status value", () => {
    for (const file of sources.filter((f) => f.endsWith(".tsx"))) {
      // `{d.status}` as text: a word alone. Use <DraftBadge>, <CatalogueBadge> or statusText(...).
      expect(read(file), file).not.toMatch(/(?<![=(])\{[\w?.]+\.status\}/);
    }
  });
});

describe("overlays are components/Modal.tsx (CLAUDE.md, web platform)", () => {
  it("has no other dialog, role=dialog or showModal", () => {
    for (const file of sources.filter((f) => f !== "components/Modal.tsx")) {
      expect(read(file), file).not.toMatch(/<dialog\b|role="(?:alert)?dialog"|aria-modal|\.showModal\(/);
    }
  });
});

describe("explorer links name only the Card contract (CLAUDE.md, static demo)", () => {
  it("passes cardContractUrl a voucher's contract and nothing else", () => {
    const calls = sources.flatMap((f) => [...read(f).matchAll(/\bcardContractUrl\(([^)]*)\)/g)].map((m) => [f, m[1]] as const));
    expect(calls.length).toBeGreaterThan(0);
    for (const [file, args] of calls) {
      if (file === "lib/chain.ts") continue;
      expect(args, `${file}: cardContractUrl(${args})`).toMatch(/\.verifyingContract$/);
    }
    // No other explorer URL is built anywhere: a wallet's page would list someone's holdings.
    for (const file of sources.filter((f) => f !== "lib/chain.ts")) expect(read(file), file).not.toMatch(/basescan\.org|etherscan\.io/);
  });
});
