// @vitest-environment jsdom
// pack-argus-assay-97f3cd2e6c: after a step starts, the Run button stays off until argus-mint's refreshed view
// arrives, so the same step can't be started twice.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { IdentityTrainingView, ProjectFile } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = join(__dirname, "..", "..", "..", "fixture", "projects", "example-teasers", "training", "keeper-v1.json");
const before = JSON.parse(readFileSync(FIXTURE, "utf8")) as IdentityTrainingView;
const after: IdentityTrainingView = { ...before, steps: { ...before.steps, candidates: "running" } };

const api = vi.hoisted(() => ({ loads: [] as ((v: unknown) => void)[], starts: 0 }));

vi.mock("@/components/MintProvider", () => ({ useMint: () => ({ health: { capabilities: { identity_training: true } }, hasToken: true }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getTraining: () => new Promise((resolve) => api.loads.push(resolve)),
  startTrainingStep: async () => {
    api.starts++;
  },
  trainingCandidate: () => "candidate.png",
}));

describe("running a training step", () => {
  it("keeps Run off until argus-mint's next view arrives", async () => {
    const { TrainingPanel } = await import("./Training");
    const el = document.createElement("div");
    const root = createRoot(el);
    const file = { id: "keeper", version: 1, kind: "identity" } as ProjectFile;
    await act(async () => root.render(<TrainingPanel projectId="example-teasers" file={file} />));
    await act(async () => api.loads.shift()!(before));
    const run = () => [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Run "))!;
    expect(run().disabled).toBe(false);
    await act(async () => run().click());
    expect(api.starts).toBe(1);
    expect(api.loads, "the reload is under way").toHaveLength(1);
    expect(run().disabled, "Run, while the reload is under way").toBe(true);
    await act(async () => api.loads.shift()!(after));
    expect(api.starts).toBe(1);
    act(() => root.unmount());
  });
});
