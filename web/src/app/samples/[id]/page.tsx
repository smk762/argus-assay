"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageTitle } from "@/components/bits";
import { Card, Collapsible, Notice, Spinner } from "@/components/ui";
import { getSample, sampleImage } from "@/lib/api";
import { checkpointName, loraText } from "@/lib/status";
import type { SampleJob } from "@/lib/types";

export default function SampleJobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<SampleJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getSample(id);
        if (!live) return;
        setJob(next);
        if (next.status === "queued" || next.status === "running") timer = setTimeout(poll, 2000);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!job) return <Spinner />;
  const r = job.request;
  const running = job.status === "queued" || job.status === "running";
  return (
    <>
      <PageTitle aside={running ? <Spinner /> : null}>
        Samples of {r.template.id} v{r.template.version}
      </PageTitle>
      <p className="mb-4 text-small text-text-secondary">
        {r.frame ? (
          <>
            Framed by{" "}
            <Link className="underline" href={`/catalogue/frame/${r.frame.id}/${r.frame.version}`}>
              {r.frame.id} v{r.frame.version}
            </Link>
            .{" "}
          </>
        ) : null}
        {r.model ? <>On {checkpointName(r.model)}. </> : null}
        {r.loras?.length ? <>LoRAs: {loraText(r.loras)}. </> : null}
        {r.bio ? (
          <>
            Bios from{" "}
            <Link className="underline" href={`/catalogue/bio/${r.bio.id}/${r.bio.version}`}>
              {r.bio.id} v{r.bio.version}
            </Link>
            .{" "}
          </>
        ) : null}
        {job.items?.length ?? 0} of {r.count ?? 0} done ({job.status}). Local only: never pinned, signed or minted.
      </p>
      {job.error ? <Notice tone="error" className="mb-4">{job.error}</Notice> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {(job.items ?? []).map((item) => (
          <li key={item.n}>
            <Card className="space-y-2">
              {item.framed || item.art ? (
                <img src={sampleImage(job.id, item.n, item.framed ? "framed" : "art")} alt={`Sample ${item.n}`} {...(item === job.items?.[0] ? { fetchPriority: "high" as const } : { loading: "lazy" as const })} className="w-full rounded-md bg-base-900" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-md bg-base-900 text-small text-text-muted">no image</div>
              )}
              <p className="text-caption text-text-secondary">{Object.entries(item.variables).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              {item.error ? <Notice tone="error">{item.error}</Notice> : null}
              {item.bio ? <p className="text-small italic">{item.bio}</p> : null}
              {item.bio_error ? <Notice tone="warning">{item.bio_error}</Notice> : null}
              {item.art && r.frame ? (
                <Link className="text-caption underline" href={`/catalogue/frame/${r.frame.id}/${r.frame.version}?sample=${job.id}&n=${item.n}`}>
                  Preview the frame on this art
                </Link>
              ) : null}
              <Collapsible title={`Attempts (${(item.attempts?.length ?? 0) + (item.bio_attempts?.length ?? 0)})`}>
                <ul className="text-caption">
                  {(item.attempts ?? []).map((a, i) => (
                    <li key={`r${i}`}>render seed {String(a.seed)}: <b>{String(a.outcome)}</b> {a.detail ? String(a.detail) : ""}</li>
                  ))}
                  {(item.bio_attempts ?? []).map((a, i) => (
                    <li key={`b${i}`}>bio: <b>{String(a.outcome)}</b> {a.detail ? `(${String(a.detail)})` : ""} {String(a.text ?? "")}</li>
                  ))}
                </ul>
                {item.prompt ? <p className="mt-1 text-caption text-text-muted">{item.prompt}</p> : null}
              </Collapsible>
            </Card>
          </li>
        ))}
        {running
          ? Array.from({ length: Math.max(0, (r.count ?? 0) - (job.items?.length ?? 0)) }, (_, i) => (
              <li key={`pending${i}`}>
                <Card className="flex aspect-[5/7] items-center justify-center text-small text-text-muted">
                  <Spinner /> &nbsp;rendering
                </Card>
              </li>
            ))
          : null}
      </ul>
    </>
  );
}
