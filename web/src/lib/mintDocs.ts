/**
 * Where Assay sends a reader for argus-mint's own docs. The docs are imported into docs/mint/ at the
 * commit Assay is synced to (schema/pins.json, `make docs-pull`) and rendered at /docs, so the text a
 * reader sees is the text this UI was built and recorded against. One table, so callers never build
 * a docs URL themselves. Adapted from argus-sightline's lib/surveyDocs.ts.
 *
 * mintDocs.test.ts fails `make check` if a section below loses its heading in the imported docs.
 */

import pins from "../../schema/pins.json";
import { staticDemo } from "@/lib/demo";

export interface SyncRecord {
  repo: string;
  /** argus-mint's `dev` commit the wire types, demo fixture and docs are synced to. */
  commit: string;
  /** The package version at that commit; the recorded fixture's /health and made_with agree (sync.test.ts). */
  version: string;
}

export const MINT: SyncRecord = {
  repo: pins.mint.repo,
  commit: pins.mint.tag,
  version: pins.mint.version,
};

export const shortSha = (sha: string): string => sha.slice(0, 7);

/** The in-app route for the docs. */
export const DOCS_ROOT = "/docs";

/**
 * Imported markdown files by mint path, in reading order, with their slug under DOCS_ROOT.
 * `label` names the page in the nav (a file's own title is a sentence).
 */
export const DOC_PAGES: readonly { file: string; slug: string; label: string }[] = [
  { file: "docs/review.md", slug: "", label: "Review" },
  { file: "docs/drafts.md", slug: "drafts", label: "Drafts" },
  { file: "docs/catalogue.md", slug: "catalogue", label: "Catalogue" },
  { file: "docs/customise.md", slug: "customise", label: "Customise" },
  { file: "docs/projects.md", slug: "projects", label: "Teaser projects" },
  { file: "docs/api.md", slug: "api", label: "HTTP API" },
  { file: "docs/cli.md", slug: "cli", label: "CLI reference" },
];

const IMPORTED = new Set(Object.keys(pins.mint.docs as Record<string, string>));

/** `[file, heading anchor]` in argus-mint at the pinned commit. */
export const SECTIONS = {
  review: ["docs/review.md", "two-reviewers-both-required"],
  "review-image": ["docs/review.md", "each-decision-is-bound-to-the-image"],
  "owner-sign-in": ["docs/review.md", "the-owners-sign-in-message"],
  "owner-edits": ["docs/review.md", "owner-edits-restart-the-review"],
  "auto-moderation": ["docs/review.md", "auto-moderation"],
  "making-a-draft": ["docs/drafts.md", "making-a-draft"],
  "draft-status": ["docs/drafts.md", "draft-status"],
  "draft-record": ["docs/drafts.md", "what-a-draft-records"],
  attempts: ["docs/drafts.md", "attempts"],
  publishing: ["docs/drafts.md", "publishing"],
  "catalogue-review": ["docs/catalogue.md", "status-and-review"],
  templates: ["docs/catalogue.md", "templates"],
  "darkroom-check": ["docs/catalogue.md", "the-darkroom-check"],
  frames: ["docs/catalogue.md", "frames"],
  bios: ["docs/catalogue.md", "bio-templates"],
  customise: ["docs/customise.md", "what-the-owner-can-change"],
  projects: ["docs/projects.md", "files"],
  "project-checks": ["docs/projects.md", "checks"],
  "project-guard": ["docs/projects.md", "singguards-verdicts-are-kept-in-the-file"],
  "project-spoilers": ["docs/projects.md", "the-spoiler-list"],
  "project-review": ["docs/projects.md", "review"],
} as const satisfies Record<string, readonly [string, string]>;

export type DocsTopic = keyof typeof SECTIONS;

const pageFor = (file: string) => DOC_PAGES.find((p) => p.file === file);

/** A page's path under DOCS_ROOT. The static export is built with trailingSlash, so its links end in `/`. */
export function pagePath(slug: string): string {
  const path = `${DOCS_ROOT}${slug ? `/${slug}` : ""}`;
  return staticDemo() ? `${path}/` : path;
}

/** The file's page under DOCS_ROOT, or GitHub at the pinned commit when the file is not imported. */
export function fileUrl(file: string, anchor = "", sync: SyncRecord = MINT): string {
  const hash = anchor ? `#${anchor}` : "";
  const page = IMPORTED.has(file) ? pageFor(file) : undefined;
  if (page) return `${pagePath(page.slug)}${hash}`;
  return `https://github.com/${sync.repo}/blob/${sync.commit}/${file}${hash}`;
}

export function docsUrl(topic: DocsTopic): string {
  const [file, anchor] = SECTIONS[topic];
  return fileUrl(file, anchor);
}

export const sourceUrl = (sync: SyncRecord = MINT): string => `https://github.com/${sync.repo}/tree/${sync.commit}`;

/**
 * GitHub's heading anchor: lower-case, drop punctuation except `-` and `_`, spaces to hyphens.
 * Repeats get `-1`, `-2`… from the caller.
 */
export const githubAnchor = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replace(/ /g, "-");

// mint's own GitHub links on any ref: the path after the ref (optional for a tree, the repo root), a query
// (`?plain=1`) and a fragment are all kept; only the ref is replaced by the pinned commit.
const MINT_BLOB = /^https:\/\/github\.com\/smk762\/argus-mint\/blob\/[^/#?]+\/([^#?]+)(\?[^#]*)?(#.*)?$/;
const MINT_TREE = /^https:\/\/github\.com\/smk762\/argus-mint\/tree\/[^/#?]+(?:\/([^#?]*))?(\?[^#]*)?(#.*)?$/;

/** Join a relative link onto the directory of the file it appears in (mint paths, posix). */
function resolvePath(from: string, rel: string): string | null {
  // A leading `/` is the repo root, as GitHub renders it.
  const parts = rel.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

export interface ResolvedLink {
  href: string;
  /** Off this site (or onto GitHub): opens in a new tab. */
  external: boolean;
}

/**
 * Where a link in an imported doc should go. Links between imported files (relative, or mint's own
 * GitHub URLs on any branch) stay in the docs; links to mint's other files go to GitHub at the pinned
 * commit, never a branch; anything but http(s), mailto and in-page anchors is dropped (null).
 */
export function resolveDocLink(href: string, from: string, sync: SyncRecord = MINT): ResolvedLink | null {
  if (href.startsWith("#")) return { href, external: false };
  const local = (file: string, anchor: string): ResolvedLink => {
    const url = fileUrl(file, anchor, sync);
    return { href: url, external: !url.startsWith(DOCS_ROOT) };
  };
  const blob = MINT_BLOB.exec(href);
  if (blob) {
    const [, file, query = "", hash = ""] = blob;
    const to = local(file, hash.slice(1));
    // An imported file opens here, where a query means nothing; on GitHub the query stays (before the anchor).
    if (!to.external || !query) return to;
    const cut = to.href.indexOf("#");
    return { href: cut < 0 ? `${to.href}${query}` : `${to.href.slice(0, cut)}${query}${to.href.slice(cut)}`, external: true };
  }
  const tree = MINT_TREE.exec(href);
  if (tree) {
    const [, path = "", query = "", hash = ""] = tree;
    return { href: `https://github.com/${sync.repo}/tree/${sync.commit}${path ? `/${path}` : ""}${query}${hash}`, external: true };
  }
  if (/^(?:https?:|mailto:)/i.test(href)) return { href, external: true };
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const cut = href.indexOf("#");
  const file = resolvePath(from, cut < 0 ? href : href.slice(0, cut));
  if (file === null) return null;
  return local(file, cut < 0 ? "" : href.slice(cut + 1));
}
