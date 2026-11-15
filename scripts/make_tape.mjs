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
// Today's fixture is sample data: stand-in renders and bios, local (non-IPFS) CIDs, a throwaway
// owner wallet and Base Sepolia's chain id. docs/demo-recording.md says what a real recording needs.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const kind = opt("--kind", "sample");
const note = opt("--note", DEFAULT_NOTE);

/** Every address the tape may show, and why. Anything else stops the tape. */
export const ADDRESSES = {
  "0xcaa3573b5550870a5e15c47c650b8700d70a8fa7": "argus-mint's demo Card contract (Base Sepolia; argus-mint README, Live demo)",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "the fixture's voucher signer: Anvil's public default account #1",
  "0x84d8530c85fa894c35563fd3b35a9c7695ca9e60": "the fixture's owner: a throwaway Account.create() wallet whose key api_fixture.py discards",
};

/** Things a public tape must never carry. Hashes (0x + 64 hex) are everywhere, so keys are caught by name. */
const FORBIDDEN = [
  [/private[_-]?key|mnemonic|seed[_-]?phrase|secret|api[_-]?key|bearer|authorization|pinata|jwt/i, "a key or token field"],
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

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** The tape for `fixtureDir`, and the image and font paths to copy beside it. Throws on anything not public. */
export function buildTape(fixtureDir, { kind = "sample", note = DEFAULT_NOTE } = {}) {
  if (!["sample", "recorded"].includes(kind)) throw new Error(`--kind must be sample or recorded, not ${kind}`);
  if (!existsSync(join(fixtureDir, "health.json"))) throw new Error(`no fixture at ${fixtureDir}`);
  const read = (rel) => JSON.parse(readFileSync(join(fixtureDir, rel), "utf8"));
  const problems = [];
  for (const file of walk(fixtureDir).filter((f) => /\.(json|md)$/.test(f))) problems.push(...checkPublic(readFileSync(file, "utf8"), relative(fixtureDir, file)));
  if (problems.length) throw new Error(`refusing to make a public tape, ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);

  const health = read("health.json");
  const drafts = read("drafts.json").items.map((item) => read(`drafts/${item.id}.json`)).reverse(); // the list is newest first
  const layouts = {};
  for (const d of drafts) if (existsSync(join(fixtureDir, "drafts", d.id, "layout.json"))) layouts[d.id] = read(`drafts/${d.id}/layout.json`);
  const samples = read("samples.json").items.map((job) => read(`samples/${job.id}.json`)).reverse();
  const files = walk(fixtureDir)
    .filter((f) => /\.(png|jpe?g|ttf|otf|woff2?)$/i.test(f))
    .map((f) => relative(fixtureDir, f).split("\\").join("/"))
    .sort();
  return {
    format: "argus-assay-tape",
    version: 1,
    recorded_at: drafts.map((d) => d.draft.created_at).sort().at(-1),
    provenance: { kind, source: "argus-mint scripts/api_fixture.py", mint_version: health.version ?? null, note },
    health,
    templates: read("templates.json"),
    frames: read("frames.json"),
    bios: read("bios.json"),
    library: existsSync(join(fixtureDir, "library.json")) ? read("library.json") : null,
    drafts,
    layouts,
    samples,
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
  console.log(`make_tape: ${kind} tape in ${relative(ROOT, out)}/ (${tape.drafts.length} drafts, ${tape.samples.length} sample job(s), ${tape.files.length} files)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
