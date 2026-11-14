"use client";

import { byFamily, checkpointName, loraChoices, loraOptions, loraWeights, loraText } from "@/lib/status";
import type { Template } from "@/lib/types";

import { INPUT } from "./bits";

/**
 * The <option>s of a checkpoint <select>, under one <optgroup> per family when there is more than one.
 * `defaultModel` gets the value "" and the word "default": a request that names no checkpoint uses it.
 */
export function CheckpointOptions({ models, defaultModel }: { models: string[]; defaultModel?: string }) {
  const option = (m: string) => (
    <option key={m} value={m === defaultModel ? "" : m} title={m}>
      {checkpointName(m)}
      {m === defaultModel ? " (default)" : ""}
    </option>
  );
  const groups = byFamily(models);
  if (groups.length < 2) return <>{models.map(option)}</>;
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.family} label={g.family || "other"}>
          {g.models.map(option)}
        </optgroup>
      ))}
    </>
  );
}

/**
 * Pick from the template's reviewed LoRAs, at their reviewed weights: only those that pair with
 * `model`, and at most `max_loras`. `picked` is name -> weight; what is sent is `loraChoices(...)`.
 */
export function LoraPicker({
  t,
  model,
  picked,
  onChange,
}: {
  t: Template;
  model: string;
  picked: Record<string, number>;
  onChange: (picked: Record<string, number>) => void;
}) {
  const max = t.max_loras ?? 1;
  const options = max > 0 ? loraOptions(t, model) : [];
  const elsewhere = max > 0 ? (t.lora_options?.length ?? 0) - options.length : 0;
  const chosen = loraChoices(picked, t, model);
  if (!options.length && !elsewhere && !t.loras?.length) return null;
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 text-small font-medium text-text-secondary">LoRAs</legend>
      {t.loras?.length ? <p className="mb-1 text-caption text-text-muted">Always applied: {loraText(t.loras)}.</p> : null}
      {options.length ? (
        <>
          <ul className="grid gap-2 sm:grid-cols-3">
            {options.map((o) => {
              const on = chosen.find((c) => c.name === o.name);
              const weights = loraWeights(o);
              const without = Object.fromEntries(Object.entries(picked).filter(([name]) => name !== o.name));
              return (
                <li key={o.name} className={`rounded-md border px-3 py-2 text-small ${on ? "border-interactive" : "border-base-600"}`}>
                  <label className={`flex items-center gap-2 ${!on && chosen.length >= max ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(on)}
                      disabled={!on && chosen.length >= max}
                      onChange={() => onChange(on ? without : { ...picked, [o.name]: weights[0] })}
                    />
                    <span className="min-w-0 truncate font-medium text-text-primary" title={o.name}>
                      {checkpointName(o.name)}
                    </span>
                  </label>
                  <div className="mt-1 flex items-center gap-2 text-caption text-text-muted">
                    {weights.length > 1 ? (
                      <select
                        className={`${INPUT} w-24 py-1`}
                        aria-label={`Weight of ${checkpointName(o.name)}`}
                        value={on?.weight ?? weights[0]}
                        disabled={!on}
                        onChange={(e) => onChange({ ...picked, [o.name]: Number(e.target.value) })}
                      >
                        {weights.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>weight {weights[0]}</span>
                    )}
                    {o.trigger_words?.length ? <span className="min-w-0 truncate" title={o.trigger_words.join(", ")}>adds: {o.trigger_words.join(", ")}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-caption text-text-muted">
            Up to {max} of the LoRAs reviewed with this template, at the reviewed weights.
            {elsewhere ? ` ${elsewhere} more pair${elsewhere === 1 ? "s" : ""} with other checkpoints.` : ""}
          </p>
        </>
      ) : elsewhere ? (
        <p className="text-caption text-text-muted">None of this template&apos;s {elsewhere} LoRA option{elsewhere === 1 ? "" : "s"} pairs with this checkpoint.</p>
      ) : null}
    </fieldset>
  );
}
