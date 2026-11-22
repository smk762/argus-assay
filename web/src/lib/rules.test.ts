/**
 * Checks for CLAUDE.md's "Must never happen" table (argus-assay#40). Most read the source rather
 * than a list of names, so a new writer, dialog, token use or status render is covered without
 * anyone remembering to add it here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BACKGROUND_STATUS, CATALOGUE_STATUS, DRAFT_STATUS, IDENTITY_OUTCOME, JOB_STATUS, SAMPLE_STATUS, STAGE_STATUS, STEP_STATUS } from "./status";
import { spoilerText } from "./projects";
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

/**
 * Where the bracket opened at `text[open]` closes, skipping quoted strings: the end index, or -1. Enough of a scanner
 * for these checks to read a whole JSX attribute value or call argument, arrows and nested braces included.
 */
function closing(text: string, open: number): number {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = text.indexOf(c, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** Each opening JSX tag of these elements, whole: `{...}` attribute values (an arrow's `=>` too) don't end it. */
function openingTags(text: string, names: string[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`<(?:${names.join("|")})\\b`, "g"))) {
    let i = m.index + m[0].length;
    for (; i < text.length && text[i] !== ">"; i++) {
      if (text[i] === "{") i = closing(text, i);
      else if (text[i] === '"' || text[i] === "'") i = text.indexOf(text[i], i + 1);
      if (i < 0) break;
    }
    out.push(i < 0 ? text.slice(m.index) : text.slice(m.index, i + 1));
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
      expect.arrayContaining([
        "createDraft", "decide", "moderatorReview", "ownerChallenge", "ownerReview", "ownerEditChallenge", "ownerEdit", "publishDraft", "startSamples",
        "saveProjectFile", "reviewProjectFile",
        "startBackgrounds", "reviewBackground", "makeTeaserDraft", "startTrainingStep", "rerunIdentityCheck",
      ]),
    );
  });

  it("gates each teaser-layer write on its own capability, before it posts", () => {
    // Each write a teaser's layers add (argus-mint wire 1.12-1.15) and the capability /health names for it.
    const GATES: Record<string, string[]> = {
      startBackgrounds: ["backgrounds"],
      reviewBackground: ["backgrounds"],
      makeTeaserDraft: ["teasers"],
      startTrainingStep: ["identity_training"],
      rerunIdentityCheck: ["identity_check", "moderate"],
    };
    // Every writer under a project but its files' (author_catalogue, below) is one of these: a new one fails here until it is listed.
    const layered = writers.filter(([, body]) => /\/projects\b|projectPath\(|trainingPath\(/.test(body) && !/projectFilePath\(/.test(body));
    expect(layered.map(([name]) => name).sort()).toEqual(["makeTeaserDraft", "reviewBackground", "startBackgrounds", "startTrainingStep"]);
    for (const [name, want] of Object.entries(GATES)) {
      const body = fns.get(name);
      expect(body, `${name} is in api.ts`).toBeDefined();
      const gates = [...body!.matchAll(/await requireCapability\("(\w+)"\)/g)];
      expect(gates.map((m) => m[1]), `${name}'s gates`).toEqual(want);
      expect(gates.at(-1)!.index, `${name} posts before requireCapability`).toBeLessThan(body!.search(POST));
    }
  });

  it("calls requireCapability before each one posts", () => {
    for (const [name, body] of writers) {
      const gate = body.indexOf("await requireCapability(");
      expect(gate, `${name} posts without requireCapability`).toBeGreaterThanOrEqual(0);
      expect(gate, `${name} posts before requireCapability`).toBeLessThan(body.search(POST));
    }
  });

  it("gates every project write on author_catalogue, before it posts", () => {
    // A writer whose request goes under /projects (its own path, or the helper that builds one) is authoring or
    // reviewing a teaser project's files: its first gate is author_catalogue, never another capability.
    const projectWriters = writers.filter(([, body]) => /projectFilePath\(/.test(body));
    expect(projectWriters.map(([name]) => name).sort()).toEqual(["reviewProjectFile", "saveProjectFile"]);
    for (const [name, body] of projectWriters) {
      const gate = body.match(/await requireCapability\("(\w+)"\)/);
      expect(gate?.[1], `${name}'s first gate`).toBe("author_catalogue");
      expect(body.indexOf(gate![0]), `${name} posts before requireCapability`).toBeLessThan(body.search(POST));
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

describe("no free-text prompts outside catalogue authoring (rule 3)", () => {
  /**
   * The only module with text fields for prompt text: the teaser project editors (moderator only). What they
   * hold reaches argus-mint by one call, saveProjectFile, which argus-mint checks on save and renders nothing
   * from until the file is approved. Adding a file here widens rule 3, so it needs the same review as CLAUDE.md.
   */
  const AUTHORING = ["components/ProjectEditors.tsx"];
  const TEXT_FIELDS = ["input", "textarea"];
  const PROMPTISH = /variable|prompt|negative/i;

  it("reads a text field's whole tag, past a handler's arrow", () => {
    // pack-argus-assay-8d49d48022: a `[^>]*` scan stopped at the `>` of `=>`, so a name after a handler went unread.
    const [tag] = openingTags(`<input value={v} onChange={(e) => set({ v: e.target.value })} name="prompt" />`, TEXT_FIELDS);
    expect(tag).toMatch(/name="prompt" \/>$/);
    expect(openingTags(`<textarea onChange={(e) => f(e)} aria-label="negative">x</textarea>`, TEXT_FIELDS)).toEqual([`<textarea onChange={(e) => f(e)} aria-label="negative">`]);
  });

  it("has no prompt field to send in a draft or a sample request", () => {
    // tsc fails here if argus-mint's wire ever grows one: then the UI must not fill it from a text box.
    const draftHasNone: "prompt" | "negative" | "negative_prompt" extends keyof CreateDraft ? false : true = true;
    const sampleHasNone: "prompt" | "negative" | "negative_prompt" extends keyof SampleRequest ? false : true = true;
    expect([draftHasNone, sampleHasNone]).toEqual([true, true]);
  });

  it("picks every template variable from a list, and types no prompt, outside the authoring module", () => {
    for (const file of sources.filter((f) => f.endsWith(".tsx") && !AUTHORING.includes(f))) {
      const text = read(file);
      // A variable's value is only ever set from a <select> of the template's list: no text field names one or a prompt.
      for (const tag of openingTags(text, TEXT_FIELDS)) expect(tag, `${file}: ${tag.slice(0, 80)}`).not.toMatch(PROMPTISH);
      // Nor does a field component get one passed in by label (AuthoredText, say).
      expect(text, `${file} renders the authoring module's text fields`).not.toMatch(/<AuthoredText\b/);
    }
  });

  it("sends the authoring module's text only through saveProjectFile", () => {
    for (const file of AUTHORING) {
      const text = read(file);
      const imported = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/api"/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
      expect(imported, `${file} imports from lib/api.ts`).toEqual(["saveProjectFile"]);
      expect(text, `${file} talks to argus-mint itself`).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon/);
    }
    // In the client, prompt text is named in one writer's request only: the project-file save, whose body is {doc}.
    const fns = exportsOf(read("lib/api.ts"));
    const save = fns.get("saveProjectFile")!;
    expect(save).toMatch(/post\(projectFilePath\(project, kind, item, version\), \{ doc \}, true\)/);
    for (const [name, body] of fns) if (name !== "saveProjectFile") expect(body, `${name} names a prompt`).not.toMatch(/\bprompt\b|\bnegative\b/);
  });

  it("has nothing outside the authoring module import its editors", () => {
    const importers = sources.filter((f) => /from "@\/components\/ProjectEditors"/.test(read(f)));
    expect(importers.sort()).toEqual(["app/projects/[id]/ProjectView.tsx", "app/projects/page.tsx"]);
  });
});

/** Each use of `spoiler_rules` in a page that could show a hold other than through spoilerText. */
function spoilerUses(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/spoiler_rules(?:\??\.(\w+))?/g)) {
    const at = m.index + m[0].length;
    const shown = text.slice(m.index, at + 60);
    if (m[1] === "length") continue;
    if (m[1] !== "map" || text[at] !== "(") {
      bad.push(shown);
      continue;
    }
    const end = closing(text, at);
    const arg = text.slice(at + 1, end < 0 ? undefined : end).trim();
    if (arg === "spoilerText") continue;
    const param = arg.match(/^\(?\s*(\w+)\s*\)?\s*=>/)?.[1];
    if (!param) {
      bad.push(shown);
      continue;
    }
    const body = arg.slice(arg.indexOf("=>") + 2);
    const all = body.match(new RegExp(`\\b${param}\\b`, "g"))?.length ?? 0;
    const through = body.match(new RegExp(`spoilerText\\(${param}\\)`, "g"))?.length ?? 0;
    const keys = body.match(new RegExp(`\\bkey=\\{${param}\\}`, "g"))?.length ?? 0;
    if (!through || all !== through + keys) bad.push(shown);
  }
  return bad;
}

describe("spoiler terms never appear: a hold is a rule number (projects)", () => {
  it("reads nothing about spoilers but argus-mint's rule numbers", () => {
    for (const file of sources) {
      const text = read(file);
      // Property names only: prose may say "the spoiler list". The wire's one spoiler field is spoiler_rules.
      for (const m of text.matchAll(/\.\s*(\w*spoil\w*)/gi)) expect(m[1], `${file}: .${m[1]}`).toBe("spoiler_rules");
    }
  });

  it("shows each hold through spoilerText, which says the number and nothing else", () => {
    const shown = sources.filter((f) => f.endsWith(".tsx") && /spoiler_rules/.test(read(f)));
    expect(shown.length).toBeGreaterThan(0);
    // pack-argus-assay-fcfb7032a1: allow what is known to be safe rather than refuse a few unsafe shapes. Each use is
    // its count, `.map(spoilerText)`, or a `.map` whose parameter is only a key or spoilerText's argument.
    for (const file of shown) expect(spoilerUses(read(file)), file).toEqual([]);
    for (const bad of ["{d.spoiler_rules.map(r => <span>{r}</span>)}", "{d.spoiler_rules.join(\", \")}", "{d.spoiler_rules.map(String)}", "{d.spoiler_rules}", "{d.spoiler_rules?.map((n) => <li key={n}>{spoilerText(n)} {n}</li>)}"]) {
      expect(spoilerUses(bad), bad).toHaveLength(1);
    }
    for (const good of ["{d.spoiler_rules?.length ? 1 : 0}", "{d.spoiler_rules.map(spoilerText)}", "{d.spoiler_rules.map(n => <li key={n}>{spoilerText(n)}</li>)}"]) {
      expect(spoilerUses(good), good).toEqual([]);
    }
    expect(spoilerText(3)).toBe("Held by spoiler rule 3");
  });
});

describe("a status has a mark and a word (rule 7)", () => {
  it("defines both for every status the wire has", () => {
    for (const map of [DRAFT_STATUS, CATALOGUE_STATUS, SAMPLE_STATUS, BACKGROUND_STATUS, JOB_STATUS, STEP_STATUS, STAGE_STATUS, IDENTITY_OUTCOME]) {
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

describe("the browser decides nothing (rules 1, 5)", () => {
  // demoMint.ts is the hosted demo's stand-in argus-mint: there it is the server, so it may.
  const page = sources.filter((f) => f !== "lib/demoMint.ts");

  it("never sets a status or awaiting: it shows the ones argus-mint sent", () => {
    for (const file of page) {
      const text = read(file);
      expect(text, `${file} sets a status or awaiting`).not.toMatch(/\.(?:status|awaiting)\s*=(?!=)/);
      expect(text, `${file} builds a status or awaiting`).not.toMatch(/\b(?:status|awaiting)\s*:\s*["[]/);
      expect(text, `${file} adds to awaiting`).not.toMatch(/\bawaiting\??\.(?:push|splice|unshift)\(/);
    }
  });

  it("never tallies reviews to work out where a draft stands", () => {
    // Reviews are shown (map, length), never counted into a decision.
    for (const file of page) expect(read(file), file).not.toMatch(/reviews\??\.(?:every|some|filter|find|findLast|reduce)\(/);
  });

  it("never checks a signature: it relays the owner's to argus-mint", () => {
    for (const file of sources) expect(read(file), file).not.toMatch(/recover(?:Message)?Address|verifyMessage|verifyTypedData|ecrecover/i);
    const pkg = JSON.parse(readFileSync(join(src, "..", "package.json"), "utf8")) as { dependencies?: object; devDependencies?: object };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /^(?:viem|ethers|siwe|web3|@noble\/(?:secp256k1|curves)|@ethersproject\/)/.test(d))).toEqual([]);
  });

  it("runs only the training step argus-mint names as next", () => {
    // The step is in the path, so each request names one step: the page asks only for argus-mint's `next`.
    const calls = sources.flatMap((f) => [...read(f).matchAll(/\bstartTrainingStep\(([^)]*)\)/g)].map((m) => [f, m[1]] as const));
    const pages = calls.filter(([f]) => f !== "lib/api.ts");
    expect(pages.length).toBeGreaterThan(0);
    for (const [file, args] of pages) expect(args.split(",").at(-1)!.trim(), `${file}: startTrainingStep(${args})`).toMatch(/^\w+\.next!?$/);
  });

  it("works out nothing on the tracker: every stage is argus-mint's, and nothing is counted", () => {
    const view = read("app/projects/[id]/tracker/TrackerView.tsx");
    // A stage is shown from `stages[key]` alone; no tally, test across drafts or derived readiness.
    expect(view).not.toMatch(/\.(?:filter|reduce|some|every|find|findLast|count)\(/);
    expect(view).toMatch(/t\.stages\[s\.key\] \? STAGE_STATUS\.reached : STAGE_STATUS\.not_yet/);
  });

  it("offers the identity check again only for a pending teaser, by argus-mint's kind and status", () => {
    const panel = read("components/AutoCheck.tsx");
    expect(panel).toMatch(/\{teaser && d\.status === "pending" \? <Rerun /);
    expect(panel).toMatch(/const teaser = d\.draft\.kind === "teaser";/);
  });

  it("never shows the person a consented reference names", () => {
    // A release's subject is a real person: argus-mint's own problems never name them, and no page does either.
    // The authoring module may hold it, to save it, and nothing else.
    for (const file of sources.filter((f) => f.endsWith(".tsx") && f !== "components/ProjectEditors.tsx")) {
      expect(read(file), file).not.toMatch(/\.subject\b/);
    }
  });

  it("offers each review step only where argus-mint's status and awaiting say so", () => {
    const view = read("app/drafts/[id]/DraftView.tsx");
    const panel = (name: string) => view.slice(view.indexOf(`function ${name}(`), view.indexOf("\nfunction ", view.indexOf(`function ${name}(`) + 1));
    expect(panel("ModeratorPanel")).toMatch(/if \(!moderatorCanReview\(d\.status, d\.awaiting\)\) return null;/);
    expect(panel("OwnerPanel")).toMatch(/if \(!ownerCanReview\(d\.status, d\.awaiting\)\) return null;/);
    expect(panel("PublishPanel")).toMatch(/if \(d\.status !== "approved"\) return null;/);
    // The guards themselves read nothing but those two fields (and /health, to publish).
    const status = read("lib/status.ts");
    expect(status).toMatch(/export const moderatorCanReview = \(status: DraftStatus, awaiting: string\[\]\): boolean =>\s*status === "pending" && awaiting\.includes\("moderator"\);/);
    expect(status).toMatch(/export const ownerCanReview = \(status: DraftStatus, awaiting: string\[\]\): boolean =>\s*status === "pending" && awaiting\.includes\("owner"\);/);
  });
});
