/**
 * Renders an imported argus-mint doc (docs/mint/) to HTML for the docs page, at build time or on the
 * server; the browser gets HTML only. Adapted from argus-sightline's lib/surveyMarkdown.ts.
 *
 * - Headings get GitHub's anchors, so `docsUrl()` and mint's own `#…` links land.
 * - Links between imported files stay in the docs. Everything else opens in a new tab, and a scheme
 *   other than http(s)/mailto is dropped (resolveDocLink).
 * - No image is loaded: the imported set has none, and one that turns up renders as a link, so
 *   reading the docs fetches nothing from a third party and needs no new CSP source.
 * - Raw HTML in the markdown is dropped (an inline tag's text stays). The files are pinned and
 *   hash-checked, but the page still shouldn't trust them with markup.
 */

import { Marked, type Tokens } from "marked";

import { githubAnchor, resolveDocLink } from "@/lib/mintDocs";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The doc's first level-1 heading (lexed, so a `# comment` in a code block is not one). */
const firstH1 = (markdown: string): Tokens.Heading | undefined =>
  new Marked({ gfm: true }).lexer(markdown).find((t): t is Tokens.Heading => t.type === "heading" && t.depth === 1);

/** The doc's title: its first `# ` heading, without inline code marks. */
export function docTitle(markdown: string, fallback: string): string {
  const h1 = firstH1(markdown);
  return h1 ? h1.text.replace(/`/g, "") : fallback;
}

const external = (href: string, title: string, inner: string) =>
  `<a href="${escapeHtml(href)}"${title} target="_blank" rel="noopener noreferrer">${inner}<span class="sr-only"> (opens in new tab)</span></a>`;

/** HTML for `markdown`, which lives at mint path `file` (relative links resolve from there). */
export function renderMintDoc(markdown: string, file: string): string {
  const seen = new Map<string, number>();
  const marked = new Marked({ gfm: true, async: false });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        // GitHub slugs the rendered text, so a link in a heading counts by its text only.
        const base = githubAnchor(token.text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"));
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const to = resolveDocLink(token.href, file);
        if (!to) return inner;
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return to.external ? external(to.href, title, inner) : `<a href="${escapeHtml(to.href)}"${title}>${inner}</a>`;
      },
      image(token: Tokens.Image) {
        const alt = escapeHtml(token.text);
        const to = resolveDocLink(token.href, file);
        if (!to) return alt;
        return to.external ? external(to.href, "", alt || "image") : `<a href="${escapeHtml(to.href)}">${alt || "image"}</a>`;
      },
      html() {
        return "";
      },
    },
  });
  const html = marked.parse(markdown) as string;
  // Wide tables scroll inside their own box, never the page.
  return html.replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, "</table></div>");
}
