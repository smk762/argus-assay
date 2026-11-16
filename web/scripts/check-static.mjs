// Post-build check for the static demo (`make pages`): the export is pure static files.
//
//   - no page references argus-mint's port or the live build's /mint proxy
//   - every page carries the hash-based CSP <meta>, and _headers is there for the host
//   - every page's strip says "runs in your browser", not "recorded output" (and data-dh-label="browser" on <html>)
//   - every draft, sample job and catalogue file on the tape has its exported page
//   - the tape is in the export, with every image and font it lists
//
//   node scripts/check-static.mjs [outDir]   (run by `npm run build:pages`)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = process.argv[2] ?? "out";
const tapeDir = (process.env.NEXT_PUBLIC_ASSAY_TAPE_URL || "/data-tape").replace(/^\/+|\/+$/g, "");
const problems = [];
const files = readdirSync(out, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile())
  .map((e) => join(e.parentPath, e.name));

const pages = files.filter((f) => f.endsWith(".html"));
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push(`${file} has no CSP <meta>`);
  if (!/<html [^>]*data-dh-label="browser"/.test(html)) problems.push(`${file} has no data-dh-label="browser" on <html>`);
  if (!html.includes("· runs in your browser</span>") || html.includes("recorded output")) problems.push(`${file}: the strip doesn't say "runs in your browser"`);
  // argus-mint's imported docs (/docs) name its default address in their text (`--port 8108`,
  // `localhost`): prose about the server, not a call to one. Those pages still get every other check.
  const docs = relative(out, file).split(sep)[0] === "docs";
  if (!docs && /:8108|localhost|"\/mint\//.test(html)) problems.push(`${file} references a live argus-mint`);
}
if (!existsSync(join(out, "_headers"))) problems.push("no _headers file");
// Chunks may still carry the live client's code (config.ts names argus-mint's default URL); what matters
// is that the static branch never calls it, which src/lib/static.test.ts checks.

const tapeJson = join(out, tapeDir, "tape.json");
if (!existsSync(tapeJson)) problems.push(`no tape at ${tapeJson}`);
else {
  const tape = JSON.parse(readFileSync(tapeJson, "utf8"));
  for (const f of tape.files) if (!existsSync(join(out, tapeDir, f))) problems.push(`tape file missing: ${f}`);
  const page = (...parts) => join(out, ...parts, "index.html");
  for (const d of tape.drafts) if (!existsSync(page("drafts", d.id))) problems.push(`no page for draft ${d.id}`);
  for (const s of tape.samples) if (!existsSync(page("samples", s.id))) problems.push(`no page for sample job ${s.id}`);
  for (const slug of ["", "drafts", "catalogue", "customise", "api", "cli"]) if (!existsSync(page("docs", slug))) problems.push(`no docs page /docs/${slug}`);
  for (const [kind, list] of [["template", tape.templates], ["frame", tape.frames], ["bio", tape.bios]]) {
    for (const e of list) if (!existsSync(page("catalogue", kind, e[kind].id, String(e[kind].version)))) problems.push(`no page for ${kind} ${e[kind].id} v${e[kind].version}`);
  }
}
if (problems.length) {
  console.error(`check-static: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-static: ${files.length} files, ${pages.length} pages, pure static, CSP on every page, tape in ${tapeDir}/`);
