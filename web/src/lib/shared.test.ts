// The vendored Dragonhound shared layer (vendor/dh/). The files themselves are pinned by
// `node vendor/dh/sync-shared.mjs --check .` in CI; this pins what the app builds from them.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoStrip } from "@/components/DemoStrip";

import { strip, stripHtml } from "../../vendor/dh/dh-strip.mjs";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const squash = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<(path)([^>]*)\/>/g, "<$1$2></$1>")
    .trim();
// The JSX strip carries data-dh-site on the <nav> (dh-strip.css marks the current link from it).
const rendered = (current?: string) =>
  renderToStaticMarkup(createElement(DemoStrip, current ? { current } : {})).replace(/<nav ([^>]*) data-dh-site="[a-z]+">/, "<nav $1>");

describe("dh-strip", () => {
  it("renders the shared source's markup, with the default label", () => {
    expect(rendered("cull")).toBe(squash(stripHtml({ current: "cull", label: strip.defaultLabel })));
    expect(rendered()).toBe(squash(stripHtml({ current: "assay", label: strip.defaultLabel })));
    expect(strip.labelMore).toBe(strip.labelSuffixes.recorded);
  });

  it("says this is assay on the nav and marks only the Assay link (dh-shared 1.2.5)", () => {
    const html = renderToStaticMarkup(createElement(DemoStrip));
    expect(html).toContain('<nav class="dh-strip" aria-label="Dragonhound Labs demos" data-dh-site="assay">');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://assay.dragonhound.dev/" data-dh-site="assay" aria-current="page">Assay</a>');
  });

  it("links the family in the same tab", () => {
    for (const link of [strip.home, ...strip.links]) expect(new URL(link.href).hostname.endsWith("dragonhound.dev")).toBe(true);
    expect(renderToStaticMarkup(createElement(DemoStrip))).not.toContain("target=");
  });
});

describe("dh-theme", () => {
  it("serves the vendored script unchanged", () => {
    expect(read("public/dh-theme.js")).toBe(read("vendor/dh/dh-theme.js"));
  });
});
