#!/usr/bin/env node
// Imports argus-mint's docs into docs/mint/ at the commit schema/pins.json pins (mint.tag), and
// records a sha256 per file in mint.docs. src/lib/sync.test.ts fails `make check` when a committed
// file no longer matches its hash, and the docs page (/docs) renders these files, never mint's live
// branch. Adapted from argus-sightline's scripts/docs-pull.mjs.
//
//   node scripts/docs-pull.mjs        (or: make docs-pull / npm run docs:pull)
//
// Run it after changing the pin, in the same PR as `wire:pull` (and the fixture, when its shape
// changed). The opsec gate refuses the import if a file carries a private IP, a home path or an
// email address: the docs are served from this UI, so nothing personal may ride along.

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pinsPath = join(root, "schema", "pins.json");
const outDir = join(root, "docs", "mint");

// The review half of mint's docs (argus-assay#16, argus-mint#35). README.md and docs/deploy.md are
// left out on purpose: they cover installing mint and deploying a collection (with the live demo's
// explorer and marketplace links), not review. Links into them go to GitHub at the pinned commit.
// docs/cli.md is generated from mint's CLI, and mint's tests fail when it is stale.
const FILES = [
  "docs/review.md",
  "docs/drafts.md",
  "docs/catalogue.md",
  "docs/customise.md",
  "docs/projects.md",
  "docs/api.md",
  "docs/cli.md",
];

const OPSEC = [
  [/\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, "a private IP address"],
  [/(?:^|[\s"'(`])(?:\/home\/[a-z_][\w-]*|\/Users\/\w+|[A-Z]:\\Users\\)/m, "a home directory path"],
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/i, "an email address"],
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function fetchFile(repo, commit, path) {
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

function opsec(path, text) {
  return OPSEC.flatMap(([re, what]) => {
    const m = re.exec(text);
    return m ? [`${path}: ${what} (${JSON.stringify(m[0].trim())})`] : [];
  });
}

async function main() {
  const pins = JSON.parse(await readFile(pinsPath, "utf8"));
  const { repo, tag } = pins.mint;
  if (!/^[0-9a-f]{40}$/.test(tag)) throw new Error(`mint.tag must be a full commit sha, not ${JSON.stringify(tag)}`);

  const files = new Map(await Promise.all(FILES.map(async (path) => [path, await fetchFile(repo, tag, path)])));

  const problems = [...files].flatMap(([p, buf]) => opsec(p, buf.toString("utf8")));
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    throw new Error("opsec gate: fix these in argus-mint before importing its docs");
  }

  await rm(outDir, { recursive: true, force: true });
  const docs = {};
  for (const [path, buf] of files) {
    await mkdir(dirname(join(outDir, path)), { recursive: true });
    await writeFile(join(outDir, path), buf);
    docs[path] = sha256(buf);
  }
  pins.mint.docs = docs;
  await writeFile(pinsPath, `${JSON.stringify(pins, null, 2)}\n`);
  console.log(`Imported ${files.size} files from ${repo}@${tag.slice(0, 7)} into docs/mint/.`);
  if (!pins.mint.version) console.log("Set mint.version in schema/pins.json to the package version at that commit.");
}

await main();
