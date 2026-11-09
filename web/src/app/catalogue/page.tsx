"use client";

import Link from "next/link";

import { CatalogueBadge, Hash, PageTitle, useLoad } from "@/components/bits";
import { Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { getBios, getFrames, getTemplates } from "@/lib/api";
import type { CatalogueStatus } from "@/lib/types";

function Row({ href, title, status, hash, detail }: { href: string; title: string; status: CatalogueStatus; hash: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 hover:bg-base-700">
        <span className="font-medium">{title}</span>
        <CatalogueBadge status={status} />
        <span className="text-caption text-text-muted">{detail}</span>
        <span className="ml-auto">
          <Hash value={hash} />
        </span>
      </Link>
    </li>
  );
}

export default function CataloguePage() {
  const all = useLoad(() => Promise.all([getTemplates(), getFrames(), getBios()]));
  if (all.error) return <Notice tone="error">{all.error}</Notice>;
  if (!all.data) return <Spinner />;
  const [templates, frames, bios] = all.data;
  return (
    <>
      <PageTitle>Catalogue</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Templates, frames and bio templates are reviewed before any card uses them. Open a draft to render samples, preview it, and approve
        it. Approved ones can be retired; cards already made with them keep their hash.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle className="mb-2">Templates</SectionTitle>
          <ul>
            {templates.map(({ template: t, hash, combinations }) => (
              <Row key={`${t.id}${t.version}`} href={`/catalogue/template/${t.id}/${t.version}`} title={`${t.id} v${t.version}`} status={t.status} hash={hash} detail={`${combinations.toLocaleString()} combinations · ${t.width}×${t.height}`} />
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle className="mb-2">Frames</SectionTitle>
          <ul>
            {frames.map(({ frame: f, hash, width, height }) => (
              <Row key={`${f.id}${f.version}`} href={`/catalogue/frame/${f.id}/${f.version}`} title={`${f.id} v${f.version}`} status={f.status} hash={hash} detail={`${width}×${height} · ${Object.keys(f.texts ?? {}).join(", ") || "no text"}`} />
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle className="mb-2">Bio templates</SectionTitle>
          <ul>
            {bios.map(({ bio: b, hash }) => (
              <Row key={`${b.id}${b.version}`} href={`/catalogue/bio/${b.id}/${b.version}`} title={`${b.id} v${b.version}`} status={b.status} hash={hash} detail={b.model} />
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
