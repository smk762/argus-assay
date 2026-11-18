#!/usr/bin/env node
// Make the static demo's data tape from fixture/ (argus-mint's recorded API responses, from its
// scripts/api_fixture.py), so `make pages` can serve assay with no argus-mint behind it.
//
//   node scripts/make_tape.mjs [--fixture fixture] [--out web/public/data-tape] [--kind sample|recorded] [--note "..."]
//
// Writes <out>/tape.json (every JSON response in one file, read by web/src/lib/tape.ts) and copies
// the images and fonts beside it under the fixture's own paths. The tape is public, so before
// writing anything it refuses:
//   - any 0x address that isn't on ADDRESSES below, each with the reason it may be shown
//   - anything that looks like a key, token, RPC URL, LAN address, internal hostname or home path
// It also refuses a bio that doesn't fill its card's bio box, or that repeats another card's
// (checkBios; the numbers are scripts/bio_fit.json's). The fixture's provenance.json, written by
// scripts/record_demo.py, gives the tape's kind (sample or recorded) and note; the flags override it.
// docs/demo-recording.md says how the fixture is recorded.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readLayers } from "./mock_teasers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const fixture = resolve(ROOT, opt("--fixture", "fixture"));
const out = resolve(ROOT, opt("--out", "web/public/data-tape"));
const DEFAULT_NOTE =
  "argus-mint's recorded API fixture: art from files, canned bios, local (non-IPFS) CIDs, a throwaway owner wallet and Base Sepolia's chain id. Nothing was pinned or minted.";
const kind = opt("--kind", undefined);
const note = opt("--note", undefined);

/** How full a bio must be, and how much two may share: see the file's _what. */
export const BIO_FIT = JSON.parse(readFileSync(join(ROOT, "scripts", "bio_fit.json"), "utf8"));

/** Every address the tape may show, and why. Anything else stops the tape. */
export const ADDRESSES = {
  "0xcaa3573b5550870a5e15c47c650b8700d70a8fa7": "argus-mint's demo Card contract (Base Sepolia; argus-mint README, Live demo)",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "the fixture's voucher signer: Anvil's public default account #1",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": "the fixture's owner: Anvil's public default account #2 (scripts/record_demo.py)",
};

/** Things a public tape must never carry. Hashes (0x + 64 hex) are everywhere, so keys are caught by name. */
const FORBIDDEN = [
  // By field name, so a bio that says "a secret shared" isn't taken for one.
  [/"[^"]*(?:private[_-]?key|mnemonic|seed[_-]?phrase|secret|api[_-]?key|bearer|authorization|pinata|jwt)[^"]*"\s*:/i, "a key or token field"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/, "a bearer token"],
  [/https?:\/\/[^"\s]*(alchemy|infura|quicknode|ankr|drpc|llamarpc)[^"\s]*/i, "an RPC URL"],
  [/\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, "a LAN address"],
  [/\b[a-z0-9-]+\.(?:local|lan|internal|home)\b/i, "an internal hostname"],
  [/\/(?:home|Users)\/[^"\s/]+/, "a home path"],
];

export function checkPublic(text, where) {
  const problems = [];
  for (const m of text.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)) {
    if (!ADDRESSES[m[0].toLowerCase()]) problems.push(`${where}: address ${m[0]} is not on the allowlist (scripts/make_tape.mjs ADDRESSES)`);
  }
  for (const [re, what] of FORBIDDEN) if (re.test(text)) problems.push(`${where}: looks like ${what} (${text.match(re)[0]})`);
  return problems;
}

/**
 * A spoiler can reach the tape only as a rule's number: argus-mint reports a hold as `spoiler_rules`, a list
 * of numbers, and never the list's terms. Any other key naming a spoiler, or a rule that isn't a number,
 * stops the tape (the spoiler file itself is private and never recorded).
 */
export function checkSpoilers(value, where, path = "") {
  const problems = [];
  if (Array.isArray(value)) value.forEach((v, i) => problems.push(...checkSpoilers(v, where, `${path}[${i}]`)));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const at = path ? `${path}.${k}` : k;
      if (/spoil/i.test(k) && k !== "spoiler_rules") problems.push(`${where}: ${at} names a spoiler; only spoiler_rules (numbers) may`);
      else if (k === "spoiler_rules" && !(Array.isArray(v) && v.every((n) => Number.isInteger(n) && n > 0)))
        problems.push(`${where}: ${at} must be rule numbers only`);
      else problems.push(...checkSpoilers(v, where, at));
    }
  }
  return problems;
}

const words = (text, name) => text.split(name).join(" ").toLowerCase().match(/[a-z0-9']+/g) ?? [];

/** A run of `n` words two bios share (their names left out), or null. */
export function sharedRun(a, nameA, b, nameB, n = BIO_FIT.shared_words) {
  const wa = words(a, nameA);
  const wb = words(b, nameB);
  const grams = new Set();
  for (let i = 0; i + n <= wb.length; i++) grams.add(wb.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= wa.length; i++) if (grams.has(wa.slice(i, i + n).join(" "))) return wa.slice(i, i + n).join(" ");
  return null;
}

const SIMILE = new Set(["like", "as"]);
const stem = (w) => {
  if (SIMILE.has(w)) return w;
  for (const suffix of ["ing", "es", "ed", "s", "e"]) if (w.endsWith(suffix) && w.length - suffix.length >= 3) return w.slice(0, -suffix.length);
  return w;
};

/** A 3-word run around "like" or "as" two bios share, stemmed ("dance like sparks" = "dancing like sparks"), or null. */
export function sharedSimile(a, nameA, b, nameB) {
  const wa = words(a, nameA);
  const sa = wa.map(stem);
  const sb = words(b, nameB).map(stem);
  const grams = new Set();
  for (let i = 0; i + 3 <= sb.length; i++) if (sb.slice(i, i + 3).some((w) => SIMILE.has(w))) grams.add(sb.slice(i, i + 3).join(" "));
  for (let i = 0; i + 3 <= sa.length; i++)
    if (sa.slice(i, i + 3).some((w) => SIMILE.has(w)) && grams.has(sa.slice(i, i + 3).join(" "))) return wa.slice(i, i + 3).join(" ");
  return null;
}

/** What each "like" compares to: the next word that isn't an article, stemmed ("like moonlit snow": "moonlit"). */
const ARTICLES = new Set(["a", "an", "the"]);
const simileHeads = (text, name) => {
  const ws = words(text, name);
  const heads = new Set();
  ws.forEach((w, i) => {
    const next = ws.slice(i + 1, i + 3).filter((x) => !ARTICLES.has(x));
    if (w === "like" && next.length) heads.add(stem(next[0]));
  });
  return heads;
};

/** A bio uses only its card's gender's pronouns ("their" is left out: it is also plural). */
const PRONOUNS = {
  female: ["she", "her", "hers", "herself"],
  male: ["he", "him", "his", "himself"],
  "non-binary": ["they", "them", "themself", "themselves"],
};
const wrongPronoun = (text, name, gender) => {
  if (!PRONOUNS[gender]) return null;
  const others = new Set(Object.entries(PRONOUNS).flatMap(([g, ps]) => (g === gender ? [] : ps)));
  return words(text, name).find((w) => others.has(w)) ?? null;
};

/** The first two words, with the card's name as one word. */
const opening = (text, name) => (text.split(name).join(" {name} ").toLowerCase().match(/\{name\}|[a-z0-9']+/g) ?? []).slice(0, 2).join(" ");

/**
 * Problems with the cards' bios: each must be BIO_FIT.min_chars..max_chars long, drawn at its
 * slot's full size and filling min_fill..max_fill of the slot's height (from the recorded layout),
 * and no two may share BIO_FIT.shared_words words in a row, their first two words, or a simile (a 3-word
 * run around "like" or "as", or "like" comparing to the same word). None may open with a word in
 * BIO_FIT.banned_openings, hold more than max_similes "like", use a banned_words word, a banned_marks mark or another gender's
 * pronouns, or end on a sentence shorter than last_sentence_words words; at most
 * name_openings open with the card's name. `bios` is [{ where, name, text, gender?, layout?, slot? }].
 */
export function checkBios(bios, fit = BIO_FIT) {
  const problems = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const b of bios) {
    const first = opening(b.text, b.name).split(" ")[0];
    if ((fit.banned_openings ?? []).includes(first)) problems.push(`${b.where}: bio opens with "${first}"`);
    const mark = (fit.banned_marks ?? []).find((m) => b.text.includes(m));
    if (mark) problems.push(`${b.where}: bio uses "${mark}"`);
    const banned = (fit.banned_words ?? []).map(stem);
    const stock = words(b.text, b.name).find((w) => banned.some((x) => w.startsWith(x)));
    const named = b.text.split(b.name).length - 1;
    if (named !== 1) problems.push(`${b.where}: bio names the card ${named} times, not once`);
    if ((b.text.match(/"/g) ?? []).length % 2 || (b.text.match(/\u201c/g) ?? []).length !== (b.text.match(/\u201d/g) ?? []).length)
      problems.push(`${b.where}: bio leaves a quotation open`);
    if (stock) problems.push(`${b.where}: bio uses the stock word "${stock}"`);
    const last = b.text.trim().split(/(?<=[.!?])\s+/).pop() ?? "";
    if (fit.last_sentence_words !== undefined && words(last, b.name).length < fit.last_sentence_words)
      problems.push(`${b.where}: bio ends on a fragment ("${last}")`);
    const pronoun = wrongPronoun(b.text, b.name, b.gender);
    if (pronoun) problems.push(`${b.where}: bio says "${pronoun}" of a ${b.gender} character`);
    const likes = words(b.text, b.name).filter((w) => w === "like").length;
    if (fit.max_similes !== undefined && likes > fit.max_similes) problems.push(`${b.where}: bio has ${likes} "like" similes, over ${fit.max_similes}`);
    if (b.text.length < fit.min_chars || b.text.length > fit.max_chars)
      problems.push(`${b.where}: bio is ${b.text.length} characters, outside ${fit.min_chars}-${fit.max_chars}`);
    if (b.layout && b.slot) {
      const { size, ascent, descent, lines } = b.layout;
      const lineH = Math.round((ascent + descent) * b.slot.line_spacing);
      const fill = (lineH * (lines.length - 1) + ascent + descent) / b.slot.height;
      if (size < b.slot.size) problems.push(`${b.where}: bio shrinks to ${size} px (the box draws it at ${b.slot.size})`);
      else if (fill < fit.min_fill || fill > fit.max_fill)
        problems.push(`${b.where}: bio fills ${pct(fill)} of its box (${lines.length} lines), outside ${pct(fit.min_fill)}-${pct(fit.max_fill)}`);
    }
  }
  const byName = bios.filter((b) => opening(b.text, b.name).startsWith("{name}"));
  if (fit.name_openings !== undefined && byName.length > fit.name_openings)
    problems.push(`${byName.map((b) => b.where).join(", ")}: ${byName.length} bios open with the card's name, over ${fit.name_openings}`);
  for (let i = 0; i < bios.length; i++)
    for (let j = i + 1; j < bios.length; j++) {
      const run = sharedRun(bios[i].text, bios[i].name, bios[j].text, bios[j].name, fit.shared_words);
      if (run) problems.push(`${bios[i].where} and ${bios[j].where}: bios share "${run}"`);
      const simile = sharedSimile(bios[i].text, bios[i].name, bios[j].text, bios[j].name);
      if (simile) problems.push(`${bios[i].where} and ${bios[j].where}: bios share the simile "${simile}"`);
      const heads = simileHeads(bios[i].text, bios[i].name);
      const head = [...simileHeads(bios[j].text, bios[j].name)].find((h) => heads.has(h));
      if (head) problems.push(`${bios[i].where} and ${bios[j].where}: bios both compare "like ${head}…"`);
      if (opening(bios[i].text, bios[i].name) === opening(bios[j].text, bios[j].name))
        problems.push(`${bios[i].where} and ${bios[j].where}: bios open alike ("${opening(bios[i].text, bios[i].name)}")`);
    }
  return problems;
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** `GET /projects` and each project's `GET /projects/{id}`, when the fixture was recorded with them (wire 1.11 on). */
export function projectsOf(fixtureDir) {
  if (!existsSync(join(fixtureDir, "projects.json"))) return { projects: { projects: [] }, project_details: [], project_layers: {} };
  const read = (rel) => JSON.parse(readFileSync(join(fixtureDir, rel), "utf8"));
  const projects = read("projects.json");
  // Backgrounds, tracker and training views (wire 1.12 on), read as the mock reads them.
  return { projects, project_details: projects.projects.map((p) => read(`projects/${p.id}.json`)), project_layers: readLayers(fixtureDir) };
}

/** The tape for `fixtureDir`, and the image and font paths to copy beside it. Throws on anything not public. */
export function buildTape(fixtureDir, { kind, note } = {}) {
  if (!existsSync(join(fixtureDir, "health.json"))) throw new Error(`no fixture at ${fixtureDir}`);
  const read = (rel) => JSON.parse(readFileSync(join(fixtureDir, rel), "utf8"));
  const recorded = existsSync(join(fixtureDir, "provenance.json")) ? read("provenance.json") : {};
  kind ??= recorded.kind ?? "sample";
  note ??= recorded.note ?? DEFAULT_NOTE;
  if (!["sample", "recorded"].includes(kind)) throw new Error(`--kind must be sample or recorded, not ${kind}`);
  const problems = [];
  for (const file of walk(fixtureDir).filter((f) => /\.(json|md)$/.test(f))) {
    const text = readFileSync(file, "utf8");
    problems.push(...checkPublic(text, relative(fixtureDir, file)));
    if (file.endsWith(".json")) problems.push(...checkSpoilers(JSON.parse(text), relative(fixtureDir, file)));
  }
  if (problems.length) throw new Error(`refusing to make a public tape, ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);

  const health = read("health.json");
  const drafts = read("drafts.json").items.map((item) => read(`drafts/${item.id}.json`)).reverse(); // the list is newest first
  const layouts = {};
  for (const d of drafts) if (existsSync(join(fixtureDir, "drafts", d.id, "layout.json"))) layouts[d.id] = read(`drafts/${d.id}/layout.json`);
  const samples = read("samples.json").items.map((job) => read(`samples/${job.id}.json`)).reverse();
  const frames = read("frames.json");
  const slotOf = (ref) => frames.find((f) => f.frame.id === ref?.id && f.frame.version === ref?.version)?.frame.texts[BIO_FIT.slot];
  const bios = [
    ...drafts.filter((d) => d.draft.bio).map((d) => ({
      where: `draft ${d.id} (${d.draft.name})`, name: d.draft.name, text: d.draft.bio.text, gender: d.draft.request?.variables?.gender,
      layout: layouts[d.id]?.slots?.[BIO_FIT.slot], slot: slotOf(d.draft.frame),
    })),
    ...samples.flatMap((job) => job.items.filter((it) => it.bio).map((it) => ({ where: `sample ${job.id}/${it.n}`, name: job.request.name, text: it.bio, gender: it.variables?.gender }))),
  ];
  const bioProblems = checkBios(bios);
  if (bioProblems.length) throw new Error(`refusing to make the tape, ${bioProblems.length} bio problem(s) (scripts/bio_fit.json)\n  ${bioProblems.join("\n  ")}`);
  const files = walk(fixtureDir)
    .filter((f) => /\.(png|jpe?g|ttf|otf|woff2?)$/i.test(f))
    .map((f) => relative(fixtureDir, f).split("\\").join("/"))
    .sort();
  return {
    format: "argus-assay-tape",
    version: 1,
    recorded_at: drafts.map((d) => d.draft.created_at).sort().at(-1),
    provenance: { kind, source: recorded.source ?? "argus-mint scripts/api_fixture.py", mint_version: health.version ?? null, note },
    health,
    templates: read("templates.json"),
    frames,
    bios: read("bios.json"),
    library: existsSync(join(fixtureDir, "library.json")) ? read("library.json") : null,
    drafts,
    layouts,
    samples,
    ...projectsOf(fixtureDir),
    files,
  };
}

function main() {
  let tape;
  try {
    tape = buildTape(fixture, { kind, note });
  } catch (e) {
    console.error(`make_tape: ${e.message}`);
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of tape.files) cpSync(join(fixture, f), join(out, f));
  writeFileSync(join(out, "tape.json"), JSON.stringify(tape) + "\n");
  console.log(`make_tape: ${tape.provenance.kind} tape in ${relative(ROOT, out)}/ (${tape.drafts.length} drafts, ${tape.samples.length} sample job(s), ${tape.files.length} files)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
