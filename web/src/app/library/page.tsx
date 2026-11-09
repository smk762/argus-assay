"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import Link from "next/link";
import { useState } from "react";

import { INPUT, PageTitle, useLoad } from "@/components/bits";
import { useMint } from "@/components/MintProvider";
import { Notice, Spinner } from "@/components/ui";
import { getLibrary, libraryImage } from "@/lib/api";
import { byFamily, checkpointName } from "@/lib/status";

/** The library as a comparison: one row per variable combination, one column per checkpoint, same seed across. */
export default function LibraryPage() {
  const { health } = useMint();
  const served = health?.capabilities.library;
  const { data, error } = useLoad(() => (served ? getLibrary() : Promise.resolve(null)), [served]);
  const [role, setRole] = useState("");
  const [big, setBig] = useState<string | null>(null);
  if (health && !served) return <Notice>This server has no pre-rendered library.</Notice>;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Spinner />;
  const families = byFamily(data.models);
  const models = families.flatMap((f) => f.models);
  const groups = Array.from(new Set(data.items.map((i) => i.group))).sort((a, b) => a - b);
  const cell = new Map(data.items.map((i) => [`${i.group}|${i.model}`, i]));
  const roles = Array.from(new Set(data.items.map((i) => i.variables.role).filter(Boolean))).sort();
  const shown = groups.filter((g) => !role || data.items.find((i) => i.group === g)?.variables.role === role);
  return (
    <>
      <PageTitle aside={<span className="text-small text-text-muted">{data.items.length} portraits</span>}>Library</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        Pre-rendered portraits of {data.template.id} v{data.template.version}: {data.count} combinations on {data.models.length} checkpoints{families.length > 1 ? `, grouped by family (${families.map((f) => f.family || "other").join(", ")})` : ""}. Each row
        uses the same variables and seed on every checkpoint, so the columns compare like for like. Any of them can become a card without a GPU:
        pick one under <Link href="/new" className="underline">New draft</Link>, or open one here.
      </p>
      {roles.length ? (
        <select className={`${INPUT} mb-3 max-w-56`} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">Every role</option>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      ) : null}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-caption">
          <thead>
            {families.length > 1 ? (
              <tr>
                <td className="sticky left-0 z-10 bg-base-900" />
                {families.map((f) => (
                  <th key={f.family} colSpan={f.models.length} scope="colgroup" className="border-b border-base-600 text-left font-semibold text-text-primary">
                    {f.family || "other"}
                  </th>
                ))}
              </tr>
            ) : null}
            <tr>
              <th className="sticky left-0 z-10 bg-base-900 text-left font-medium text-text-secondary">Variables</th>
              {models.map((m) => (
                <th key={m} className="min-w-36 text-left font-medium text-text-secondary" title={m}>
                  {checkpointName(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const any = data.items.find((i) => i.group === g)!;
              return (
                <tr key={g}>
                  <td className="sticky left-0 z-10 max-w-44 bg-base-900 align-top text-text-secondary">
                    {Object.entries(any.variables).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-text-muted">{k}</span> {v}
                      </div>
                    ))}
                    <div className="text-text-muted">seed {any.seed}</div>
                  </td>
                  {models.map((m) => {
                    const it = cell.get(`${g}|${m}`);
                    return (
                      <td key={m} className="align-top">
                        {it ? (
                          <button type="button" onClick={() => setBig(it.id)} className="block">
                            <img src={libraryImage(it.id, 320)} alt={`${checkpointName(m)}: ${Object.values(it.variables).join(", ")}`} loading="lazy" className="w-36 rounded bg-base-800" />
                          </button>
                        ) : (
                          <div className="flex h-28 w-36 items-center justify-center rounded bg-base-800 text-text-muted">not rendered</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {big ? (
        <div role="dialog" aria-modal="true" aria-label="Portrait" className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)}>
          <figure className="max-h-full max-w-5xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <img src={libraryImage(big)} alt="The full portrait" className="max-h-[80vh] rounded-lg" />
            <figcaption className="flex flex-wrap items-center justify-between gap-2 text-small text-white">
              <span>{checkpointName(data.items.find((i) => i.id === big)?.model ?? "")}</span>
              <span className="flex gap-3">
                <Link href={`/new?library=${big}`} className="underline">
                  Make a card from this
                </Link>
                <button type="button" onClick={() => setBig(null)} className="underline">
                  Close
                </button>
              </span>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </>
  );
}
