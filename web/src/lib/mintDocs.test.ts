import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import pins from "../../schema/pins.json";
import { DOC_PAGES, docsUrl, fileUrl, githubAnchor, MINT, resolveDocLink, SECTIONS, shortSha, sourceUrl, type DocsTopic } from "@/lib/mintDocs";
import { docTitle, renderMintDoc } from "@/lib/mintMarkdown";

const imported = pins.mint.docs as Record<string, string>;
const read = (file: string) => readFileSync(join(__dirname, "..", "..", "docs", "mint", file), "utf8");

/** Heading anchors in a markdown file, outside code fences. */
function anchors(markdown: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    else if (!fenced && line.startsWith("#")) out.add(githubAnchor(line.replace(/^#+/, "")));
  }
  return out;
}

describe("mintDocs", () => {
  it("names mint's source at the pinned commit, never a branch", () => {
    expect(MINT.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sourceUrl()).toBe(`https://github.com/smk762/argus-mint/tree/${MINT.commit}`);
    expect(shortSha(MINT.commit)).toHaveLength(7);
  });

  it("sends each topic to its section in the imported docs", () => {
    expect(docsUrl("review")).toBe("/docs#two-reviewers-both-required");
    expect(docsUrl("draft-status")).toBe("/docs/drafts#draft-status");
    expect(docsUrl("frames")).toBe("/docs/catalogue#frames");
    expect(docsUrl("darkroom-check")).toBe("/docs/catalogue#the-darkroom-check");
  });

  it("links only to headings that exist in the imported docs", () => {
    for (const [topic, [file, anchor]] of Object.entries(SECTIONS) as [DocsTopic, readonly [string, string]][]) {
      expect(imported, `${topic}: ${file} is not imported`).toHaveProperty([file]);
      expect(anchors(read(file)), `${topic}: ${file}#${anchor}`).toContain(anchor);
      expect(renderMintDoc(read(file), file), `${topic}: rendered id`).toContain(`id="${anchor}"`);
    }
  });

  it("has a page for every imported markdown file and imports every page", () => {
    const md = Object.keys(imported).filter((f) => f.endsWith(".md")).sort();
    expect(DOC_PAGES.map((p) => p.file).sort()).toEqual(md);
  });

  it("leaves the README and deploy guide (the live collection) out of the import", () => {
    expect(imported).not.toHaveProperty(["README.md"]);
    expect(imported).not.toHaveProperty(["docs/deploy.md"]);
    expect(fileUrl("docs/deploy.md", "x")).toBe(`https://github.com/smk762/argus-mint/blob/${MINT.commit}/docs/deploy.md#x`);
  });
});

describe("resolveDocLink", () => {
  it("keeps links between imported files in the docs", () => {
    expect(resolveDocLink("drafts.md#draft-status", "docs/review.md")).toEqual({ href: "/docs/drafts#draft-status", external: false });
    expect(resolveDocLink("review.md", "docs/drafts.md")).toEqual({ href: "/docs", external: false });
    expect(resolveDocLink("/docs/cli.md", "docs/api.md")).toEqual({ href: "/docs/cli", external: false });
    expect(resolveDocLink("#auth", "docs/api.md")).toEqual({ href: "#auth", external: false });
  });

  it("maps mint's own GitHub URLs on any branch to the pinned commit", () => {
    expect(resolveDocLink("https://github.com/smk762/argus-mint/blob/dev/docs/catalogue.md#frames", "docs/review.md")).toEqual({
      href: "/docs/catalogue#frames",
      external: false,
    });
    expect(resolveDocLink("https://github.com/smk762/argus-mint/blob/dev/frames/card-green-v1.yaml", "docs/catalogue.md")).toEqual({
      href: `https://github.com/smk762/argus-mint/blob/${MINT.commit}/frames/card-green-v1.yaml`,
      external: true,
    });
    expect(resolveDocLink("https://github.com/smk762/argus-mint/tree/dev/fixtures/api", "docs/api.md")).toEqual({
      href: `https://github.com/smk762/argus-mint/tree/${MINT.commit}/fixtures/api`,
      external: true,
    });
  });

  it("sends the rest off-site in a new tab, at the pinned commit for mint's other files", () => {
    expect(resolveDocLink("https://eips.ethereum.org/EIPS/eip-4361", "docs/review.md")).toEqual({ href: "https://eips.ethereum.org/EIPS/eip-4361", external: true });
    expect(resolveDocLink("../README.md#install", "docs/api.md")).toEqual({
      href: `https://github.com/smk762/argus-mint/blob/${MINT.commit}/README.md#install`,
      external: true,
    });
  });

  it("drops scripts and paths that climb out of the repo", () => {
    expect(resolveDocLink("javascript:alert(1)", "docs/review.md")).toBeNull();
    expect(resolveDocLink("data:text/html,x", "docs/review.md")).toBeNull();
    expect(resolveDocLink("../../etc/passwd", "docs/review.md")).toBeNull();
  });

  it("resolves every link in the imported docs, and none goes to a branch", () => {
    for (const { file } of DOC_PAGES) {
      for (const m of read(file).matchAll(/\]\(([^)\s]+)/g)) {
        const to = resolveDocLink(m[1], file);
        expect(to, `${file}: ${m[1]}`).not.toBeNull();
        expect(to?.href, `${file}: ${m[1]}`).not.toMatch(/argus-mint\/(?:blob|tree)\/(?:dev|main)\//);
      }
    }
  });
});

describe("renderMintDoc", () => {
  it("gives headings GitHub's anchors, numbering repeats", () => {
    const html = renderMintDoc("# A\n\n## What `draft.json` records\n\n## Notes\n\n## Notes\n", "docs/x.md");
    expect(html).toContain('<h2 id="what-draftjson-records">What <code>draft.json</code> records</h2>');
    expect(html).toContain('<h2 id="notes">');
    expect(html).toContain('<h2 id="notes-1">');
    expect(renderMintDoc("## See [Drafts](drafts.md)\n", "docs/x.md")).toContain('<h2 id="see-drafts">');
  });

  it("drops raw HTML and unsafe links, keeping their text", () => {
    const html = renderMintDoc('<script>alert(1)</script>\n\nA <b onclick="x">b</b> [c](javascript:alert(1))\n', "docs/x.md");
    expect(html).toBe("<p>A b c</p>\n");
  });

  it("loads no image: one renders as a link", () => {
    expect(renderMintDoc("![a cat](https://example.com/cat.png)\n", "docs/x.md")).not.toContain("<img");
  });

  it("opens off-site links in a new tab and keeps docs links in place", () => {
    const html = renderMintDoc("[out](https://example.com/) [in](drafts.md#attempts)\n", "docs/review.md");
    expect(html).toContain('<a href="https://example.com/" target="_blank" rel="noopener noreferrer">out');
    expect(html).toContain('<a href="/docs/drafts#attempts">in</a>');
  });

  it("puts tables in their own scroll box", () => {
    expect(renderMintDoc(read("docs/review.md"), "docs/review.md")).toContain('<div class="doc-table"><table>');
  });

  it("titles a page by its first heading", () => {
    expect(docTitle(read("docs/review.md"), "x")).toBe("Review: who approves what");
    expect(docTitle("no heading", "fallback")).toBe("fallback");
    expect(docTitle("```bash\n# a comment\n```\n", "fallback")).toBe("fallback");
  });
});
