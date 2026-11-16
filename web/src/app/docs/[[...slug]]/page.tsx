import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DOC_PAGES, MINT, pagePath, shortSha, sourceUrl } from "@/lib/mintDocs";
import { docTitle, renderMintDoc } from "@/lib/mintMarkdown";
import { MINT_PYPI_URL } from "@/lib/demo";

/**
 * argus-mint's docs, imported at the pinned commit (docs/mint/, `make docs-pull`) and rendered on the
 * server: the browser gets HTML, with no script of its own and nothing fetched from elsewhere. The same
 * route serves both builds; the static demo exports one page per entry in DOC_PAGES.
 */

type Params = Promise<{ slug?: string[] }>;

export const dynamicParams = false;
export const generateStaticParams = () => DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));

// The imported files never change while the server runs, so each is read once. A failed read is not kept.
const memo = new Map<string, Promise<string>>();
function readDoc(file: string): Promise<string> {
  let p = memo.get(file);
  if (!p) {
    p = readFile(join(process.cwd(), "docs", "mint", file), "utf8");
    memo.set(file, p);
    p.catch(() => memo.delete(file));
  }
  return p;
}

const pageFor = (slug: string[] | undefined) => DOC_PAGES.find((p) => p.slug === (slug ?? []).join("/"));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = pageFor((await params).slug);
  if (!page) return {};
  return { title: `${docTitle(await readDoc(page.file), page.label)} · argus-mint docs · Argus Assay` };
}

const LINK = "underline decoration-base-600 underline-offset-2 hover:text-text-primary";

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

export default async function MintDocsPage({ params }: { params: Params }) {
  const page = pageFor((await params).slug);
  if (!page) notFound();
  const html = renderMintDoc(await readDoc(page.file), page.file);
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="argus-mint docs" className="lg:sticky lg:top-4 lg:self-start">
        <ul className="flex flex-wrap gap-x-1 gap-y-1 text-small lg:flex-col lg:gap-0.5">
          {DOC_PAGES.map((p) => {
            const current = p.slug === page.slug;
            return (
              <li key={p.file}>
                <Link
                  href={pagePath(p.slug)}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-md px-2.5 py-1.5 ${current ? "bg-base-700 text-text-primary" : "text-text-secondary hover:bg-base-700 hover:text-text-primary"}`}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">
        <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-base-600/60 pb-3 text-caption text-text-muted">
          <span>
            <strong className="font-semibold text-text-primary">argus-mint {MINT.version}</strong> @ <code className="font-mono">{shortSha(MINT.commit)}</code>
          </span>
          <span aria-hidden="true">·</span>
          <External href={sourceUrl()}>GitHub</External>
          <span aria-hidden="true">·</span>
          <External href={MINT_PYPI_URL}>PyPI</External>
          <span className="basis-full">The docs this build of Assay is synced to: the same argus-mint commit as its wire types and demo data.</span>
        </p>
        <article className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
