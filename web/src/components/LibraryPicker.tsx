"use client";

/* eslint-disable @next/next/no-img-element -- images come from argus-mint, not the Next image pipeline */
import { useState } from "react";

import { libraryImage } from "@/lib/api";
import { checkpointName } from "@/lib/status";
import type { LibraryListing } from "@/lib/types";

import { INPUT } from "./bits";
import { CheckpointOptions } from "./Checkpoints";

/** Pick a pre-rendered portrait: filter by checkpoint and by any variable. */
export function LibraryPicker({ library, selected, onSelect }: { library: LibraryListing; selected: string | null; onSelect: (id: string) => void }) {
  const [model, setModel] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const names = Array.from(new Set(library.items.flatMap((i) => Object.keys(i.variables)))).sort();
  const items = library.items.filter(
    (i) => (!model || i.model === model) && Object.entries(filters).every(([k, v]) => !v || i.variables[k] === v),
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select className={INPUT} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Checkpoint">
          <option value="">Every checkpoint</option>
          <CheckpointOptions models={library.models} />
        </select>
        {names.map((n) => (
          <select key={n} className={INPUT} value={filters[n] ?? ""} onChange={(e) => setFilters({ ...filters, [n]: e.target.value })} aria-label={n}>
            <option value="">Any {n}</option>
            {Array.from(new Set(library.items.map((i) => i.variables[n]))).sort().map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ))}
      </div>
      <p className="text-caption text-text-muted">
        {items.length} of {library.items.length} portraits
      </p>
      <ul className="grid max-h-[32rem] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto pr-1">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onSelect(i.id)}
              aria-pressed={selected === i.id}
              className={`block w-full overflow-hidden rounded-md border-2 text-left ${selected === i.id ? "border-interactive" : "border-transparent hover:border-base-600"}`}
            >
              <img src={libraryImage(i.id, 320)} alt={Object.values(i.variables).join(", ")} loading="lazy" className="aspect-[9/7] w-full bg-base-900 object-cover" />
              <span className="block truncate px-1 py-0.5 text-caption text-text-secondary">{checkpointName(i.model)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
