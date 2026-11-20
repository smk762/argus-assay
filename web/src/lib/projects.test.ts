import { describe, expect, it } from "vitest";

import {
  currentVerdicts,
  fileLabel,
  filesOf,
  groupFrames,
  identityVoices,
  isId,
  knownVoices,
  nextTeaser,
  nextVersion,
  parseRef,
  refOptions,
  refText,
  refValue,
  saveDoc,
  saveTarget,
  spoilerText,
  storedVerdicts,
  teaserOrder,
} from "./projects";
import type { FrameInfo, ProjectDetail, ProjectFile } from "./types";

const file = (kind: ProjectFile["kind"], id: string, version: number, status: ProjectFile["status"], doc: Record<string, unknown> = {}): ProjectFile => ({
  kind,
  id,
  version,
  status,
  hash: "0x00",
  file: `${kind}/${id}-v${version}`,
  doc: { id, version, status, ...doc },
});

const detail: ProjectDetail = {
  id: "example-teasers",
  files: [
    file("project", "example-teasers", 1, "approved", { title: "Lantern Coast", policy: "default" }),
    file("identity", "keeper", 1, "approved", { voice: "keeper" }),
    file("identity", "lamp", 1, "draft", { voice: "lamp" }),
    file("line", "keep-it-lit", 1, "approved", { voice: "keeper" }),
    file("line", "keep-it-lit", 2, "draft", { voice: "keeper" }),
    file("line", "aside", 1, "draft", { voice: "narrator" }),
    file("scene", "lamp-room", 1, "retired"),
  ],
  checks: {
    problems: [],
    spoiler_rules: [],
    guard_ran: true,
    guard: [
      { field: "line keep-it-lit v1: text", passed: true, detail: "" },
      { field: "line keep-it-lit v1: published", passed: false, detail: "rule X" },
      { field: "line keep-it-lit v2: text", passed: true, detail: "" },
    ],
  },
};

describe("grouping what argus-mint sent", () => {
  it("keeps each kind's files in the server's order", () => {
    expect(filesOf(detail, "line").map(refText)).toEqual(["keep-it-lit v1", "keep-it-lit v2", "aside v1"]);
    expect(refOptions(detail, "identity")).toEqual([
      { ref: { id: "keeper", version: 1 }, status: "approved" },
      { ref: { id: "lamp", version: 1 }, status: "draft" },
    ]);
  });

  it("finds one file's current SingGuard verdicts by argus-mint's own label, and no other file's", () => {
    const f = detail.files[3];
    expect(fileLabel(f)).toBe("line keep-it-lit v1");
    const current = currentVerdicts(detail.checks, f);
    expect([...current.keys()]).toEqual(["text", "published"]);
    expect(current.get("published")).toEqual({ field: "line keep-it-lit v1: published", passed: false, detail: "rule X" });
  });

  it("reads a file's stored verdicts, or none", () => {
    expect(storedVerdicts({})).toEqual([]);
    const v = { field: "prompt", sha256: "a".repeat(64), policy: "default", passed: true, detail: "", checked_at: "2026-11-18T06:31:47Z" };
    expect(storedVerdicts({ guard: [v] })).toEqual([v]);
  });

  it("lists the voices: the project's, and the identities' for a line", () => {
    expect(knownVoices(detail)).toEqual(["keeper", "lamp", "narrator"]);
    expect(identityVoices(detail)).toEqual(["keeper", "lamp"]);
  });
});

describe("spoiler holds", () => {
  it("say the rule's number and nothing else", () => {
    expect(spoilerText(1)).toBe("Held by spoiler rule 1");
    expect(spoilerText(12)).toBe("Held by spoiler rule 12");
  });
});

describe("saving", () => {
  it("saves a draft over itself, and an approved or retired file as the id's next version", () => {
    expect(saveTarget(detail, detail.files[4])).toEqual({ id: "keep-it-lit", version: 2 });
    expect(saveTarget(detail, detail.files[3])).toEqual({ id: "keep-it-lit", version: 3 });
    expect(saveTarget(detail, detail.files[6])).toEqual({ id: "lamp-room", version: 2 });
    expect(nextVersion(detail, "scene", "shoreline")).toBe(1);
  });

  it("sends neither what argus-mint writes (status, approval, verdicts) nor what the path says", () => {
    const doc = { id: "a", version: 2, project: "p", status: "approved", approved_by: "x", approved_at: "2026-11-18", guard: [], voice: "keeper", text: "Hi.", published: null };
    expect(saveDoc(doc)).toEqual({ voice: "keeper", text: "Hi.", published: null });
    expect(saveDoc({ title: "T", attribution: undefined })).toEqual({ title: "T" });
  });

  it("takes argus-mint's id pattern", () => {
    expect(isId("lamp-room")).toBe(true);
    for (const bad of ["", "-x", "Lamp", "a b", "a".repeat(65)]) expect(isId(bad), bad).toBe(false);
  });
});

describe("references and teaser numbers", () => {
  it("round-trips a reference through a select's value", () => {
    expect(parseRef(refValue({ id: "lamp-room", version: 3 }))).toEqual({ id: "lamp-room", version: 3 });
    expect(refValue(null)).toBe("");
    for (const bad of ["", "x", "x@0", "x@1.5", "@1"]) expect(parseRef(bad), bad).toBeNull();
  });

  it("numbers teasers T1, T2… in order, filling the first gap", () => {
    expect(nextTeaser({})).toBe("T1");
    expect(nextTeaser({ T1: 1, T3: 1 })).toBe("T2");
    expect(teaserOrder({ T10: 1, T2: 1, T1: 1 })).toEqual(["T1", "T2", "T10"]);
  });
});

describe("a project's frames, grouped as GET /frames labels them", () => {
  const frame = (id: string, project?: string | null): FrameInfo =>
    ({ file: `${id}.yaml`, hash: "h", width: 1, height: 1, project, frame: { id, version: 1, status: "draft", overlay: "o.png", texts: {}, window: { x: 0, y: 0, width: 1, height: 1 } } }) as FrameInfo;
  const frames = [frame("card-green"), frame("example-teaser", null), frame("example-teasers/harbour-feed", "example-teasers"), frame("other/cam", "other")];

  it("puts the project's own apart from the global ones, and leaves another project's out", () => {
    const g = groupFrames(frames, "example-teasers");
    expect(g.own.map((f) => f.frame.id)).toEqual(["example-teasers/harbour-feed"]);
    expect(g.global.map((f) => f.frame.id)).toEqual(["card-green", "example-teaser"]);
    expect(g.other).toEqual([]);
  });

  it("keeps another project's frame only where the file already names it, so it can be seen and taken out", () => {
    expect(groupFrames(frames, "example-teasers", [null, { id: "other/cam", version: 1 }]).other.map((f) => f.frame.id)).toEqual(["other/cam"]);
    expect(groupFrames(frames, "other").own.map((f) => f.frame.id)).toEqual(["other/cam"]);
  });

  it("round-trips a two-part id through a picker's value", () => {
    expect(parseRef(refValue({ id: "example-teasers/harbour-feed", version: 2 }))).toEqual({ id: "example-teasers/harbour-feed", version: 2 });
  });
});
