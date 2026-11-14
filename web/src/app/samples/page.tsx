"use client";

import Link from "next/link";

import { PageTitle, useLoad } from "@/components/bits";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { getSamples } from "@/lib/api";
import { when } from "@/lib/time";

const ref = (r: { id: string; version: number } | null | undefined) => (r ? `${r.id} v${r.version}` : null);

export default function SamplesPage() {
  const { data, error, reload } = useLoad(() => getSamples());
  return (
    <>
      <PageTitle aside={<Button small onClick={reload}>Refresh</Button>}>Samples</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Sample cards rendered to review templates, frames and bio templates. Start one from a{" "}
        <Link href="/catalogue" className="underline">catalogue</Link> page. They are never pinned, signed or minted.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!data && !error ? <Spinner /> : null}
      <div className="space-y-2">
        {data?.items.map((job) => (
          <Link key={job.id} href={`/samples/${job.id}`} className="block">
            <Card className="hover:border-interactive">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                <b>{ref(job.request.template)}</b>
                {job.request.frame ? <span>framed by {ref(job.request.frame)}</span> : null}
                {job.request.bio ? <span>bio {ref(job.request.bio)}</span> : null}
                <span className="text-text-muted">
                  {job.items?.length ?? 0}/{job.request.count} · {job.status} · {when(job.created_at)}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
