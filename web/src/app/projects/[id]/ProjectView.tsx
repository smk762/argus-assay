"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

import { CatalogueBadge, DocLink, Hash, INPUT, PageTitle, useLoad } from "@/components/bits";
import { useMint } from "@/components/MintProvider";
import { FileEditor, type Choices } from "@/components/ProjectEditors";
import { Button, Card, Kv, Notice, SectionTitle, Spinner } from "@/components/ui";
import { getFrames, getProject, getTemplates, reviewProjectFile } from "@/lib/api";
import { staticDemo } from "@/lib/demo";
import {
  currentVerdicts,
  docOf,
  fileKey,
  filesOf,
  PRESENCE_TEXT,
  PROJECT_KINDS,
  PROVENANCE_TEXT,
  projectFile,
  refText,
  spoilerText,
  storedVerdicts,
  teaserOrder,
  VERDICT,
  type ProjectKind,
} from "@/lib/projects";
import { readReviewer, saveReviewer } from "@/lib/reviewer";
import { catalogueAction, samplingText } from "@/lib/status";
import { when } from "@/lib/time";
import type { ProjectChecks, ProjectDetail, ProjectFile } from "@/lib/types";

/** Why the moderator's controls are off here, or null. */
function useAuthoring(): string | null {
  const { health, hasToken } = useMint();
  if (!health) return "Waiting for argus-mint.";
  if (!health.capabilities.author_catalogue) {
    return staticDemo()
      ? "This demo shows the recorded project; authoring and review need a running argus-mint."
      : "This server can't write project files (no moderator token is set on it, its projects directory isn't writable, or it is read-only).";
  }
  return hasToken ? null : "Set the moderator token (key icon) to author and review.";
}

function Verdict({ passed }: { passed: boolean }) {
  const v = passed ? VERDICT.passed : VERDICT.refused;
  return (
    <span className={passed ? "text-success" : "text-error"}>
      <span aria-hidden="true">{v.mark}</span> {v.label}
    </span>
  );
}

function ChecksPanel({ checks }: { checks: ProjectChecks }) {
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Checks</SectionTitle>
        <DocLink topic="project-checks">What argus-mint checks</DocLink>
      </div>
      {!checks.guard_ran ? (
        <Notice tone="warning" className="mb-2">
          No darkroom is configured on this server, so SingGuard can&apos;t judge text: a file whose texts have no verdict that still holds
          can&apos;t be approved.
        </Notice>
      ) : null}
      <h3 className="mt-1 text-small font-medium text-text-secondary">Problems</h3>
      {checks.problems.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-small">
          {checks.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">argus-mint reports none.</p>
      )}
      <h3 className="mt-3 text-small font-medium text-text-secondary">Spoiler list</h3>
      {checks.spoiler_rules.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-small">
          {checks.spoiler_rules.map((n) => (
            <li key={n}>{spoilerText(n)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">No rule matches. A match is reported by its number only.</p>
      )}
      <p className="mt-3 text-caption text-text-muted">
        SingGuard&apos;s verdicts are shown with each file below. <DocLink topic="project-guard">How verdicts are kept</DocLink>
      </p>
    </Card>
  );
}

/** One file's SingGuard record: each stored verdict, when it was made, and whether argus-mint still counts it. */
function Verdicts({ file, checks }: { file: ProjectFile; checks: ProjectChecks }) {
  const stored = storedVerdicts(file.doc);
  const current = currentVerdicts(checks, file);
  if (!stored.length) return <p className="text-small text-text-muted">No SingGuard verdict is stored in this file.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-small">
        <caption className="sr-only">SingGuard verdicts on {refText(file)}</caption>
        <thead className="text-caption text-text-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Field</th>
            <th scope="col" className="py-1 pr-3 font-medium">Verdict</th>
            <th scope="col" className="py-1 pr-3 font-medium">Policy</th>
            <th scope="col" className="py-1 pr-3 font-medium">Checked</th>
            <th scope="col" className="py-1 font-medium">Counts now</th>
          </tr>
        </thead>
        <tbody>
          {stored.map((v) => (
            <tr key={`${v.field}:${v.sha256}:${v.policy}`} className="border-t border-base-600/40 align-top">
              <td className="py-1 pr-3 font-mono">{v.field}</td>
              <td className="py-1 pr-3">
                <Verdict passed={v.passed} />
                {v.detail ? <span className="block text-caption text-text-secondary">{v.detail}</span> : null}
              </td>
              <td className="py-1 pr-3">{v.policy}</td>
              <td className="py-1 pr-3">{when(v.checked_at)}</td>
              <td className="py-1">{current.has(v.field) ? "Yes" : "No: the text or the policy changed since"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="whitespace-pre-wrap border-l-2 border-base-600 pl-3 text-small">{children}</blockquote>;
}

function Text({ label, value, empty = "none" }: { label: string; value: string | null | undefined; empty?: string }) {
  return (
    <div className="mt-2">
      <h4 className="text-caption text-text-muted">{label}</h4>
      {value ? <Quote>{value}</Quote> : <p className="text-small text-text-muted">{empty}</p>}
    </div>
  );
}

/** A file's content, laid out for reading. */
function DocBody({ file, detail }: { file: ProjectFile; detail: ProjectDetail }) {
  if (file.kind === "project") {
    const d = docOf(file as ProjectFile & { kind: "project" });
    return (
      <dl>
        <Kv label="Working title">{d.title}</Kv>
        <Kv label="Attribution">{d.attribution ?? "none: quotes are unsigned"}</Kv>
        <Kv label="“Generated image” label">{d.generated_label === false ? "off" : "on"}</Kv>
        <Kv label="Frames">{d.frames?.length ? d.frames.map(refText).join(", ") : "none listed"}</Kv>
        <Kv label="SingGuard policy">{d.policy ?? "default"}</Kv>
        <Kv label="Checkpoint family">{d.family ?? "sdxl"}</Kv>
        <Kv label="Style LoRA">{d.style_lora ? `${d.style_lora.name} @ ${d.style_lora.weight ?? 1}` : "none yet"}</Kv>
      </dl>
    );
  }
  if (file.kind === "identity") {
    const d = docOf(file as ProjectFile & { kind: "identity" });
    return (
      <>
        <dl>
          <Kv label="Voice">{d.voice}</Kv>
          <Kv label="Presence">{PRESENCE_TEXT[d.presence] ?? d.presence}</Kv>
          {d.frame ? <Kv label="Frame">{refText(d.frame)}</Kv> : null}
          <Kv label="LoRA">{d.lora ? `${d.lora.name} @ ${d.lora.weight ?? 1}, passed by proof run ${d.proof_run}` : "none yet"}</Kv>
        </dl>
        {d.presence === "embodied" ? (
          <>
            <Text label="Appearance prompt" value={d.prompt} />
            <Text label="Negative prompt" value={d.negative} />
          </>
        ) : null}
        <h4 className="mt-2 text-caption text-text-muted">References</h4>
        {d.references?.length ? (
          <ul className="text-small">
            {d.references.map((r) => (
              <li key={r.file}>
                <code>{r.file}</code> <Hash value={r.sha256} />: {PROVENANCE_TEXT[r.provenance] ?? r.provenance}
                {r.consent ? `, consent record ${r.consent}` : ""}
                {r.held_out ? ", held out of training" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-muted">none</p>
        )}
      </>
    );
  }
  if (file.kind === "scene") {
    const d = docOf(file as ProjectFile & { kind: "scene" });
    const a = d.character_area;
    return (
      <>
        <dl>
          <Kv label="Checkpoint">{d.model}</Kv>
          <Kv label="Sampling">{samplingText({ ...d.sampling, clip_skip: d.sampling.clip_skip ?? undefined, guidance: d.sampling.guidance ?? undefined })}</Kv>
          <Kv label="Size">
            {d.width}×{d.height}
          </Kv>
          <Kv label="Backgrounds to review">{d.backgrounds ?? 3}</Kv>
          <Kv label="Where a figure may go">{a ? `${a.width}×${a.height} at (${a.x}, ${a.y})` : "nowhere: nobody is painted in"}</Kv>
          <Kv label="Attempts on a refusal">up to {d.max_attempts ?? 4}</Kv>
        </dl>
        <Text label="Background prompt" value={d.prompt} />
        <Text label="Negative prompt" value={d.negative} />
      </>
    );
  }
  if (file.kind === "line") {
    const d = docOf(file as ProjectFile & { kind: "line" });
    return (
      <>
        <dl>
          <Kv label="Voice">{d.voice}</Kv>
          <Kv label="Source">{d.source}</Kv>
        </dl>
        <Text label="Text, verbatim" value={d.text} />
        <Text label="Published wording" value={d.published} empty="the text as it is" />
      </>
    );
  }
  const d = docOf(file as ProjectFile & { kind: "teasers" });
  const line = (id: string, version: number) => filesOf(detail, "line").find((f) => f.id === id && f.version === version);
  const order = teaserOrder(d.teasers ?? {});
  if (!order.length) return <p className="text-small text-text-muted">No teasers yet.</p>;
  return (
    <ol className="space-y-3">
      {order.map((n) => {
        const t = d.teasers[n];
        const l = line(t.line.id, t.line.version);
        const shown = l ? String(l.doc.published ?? l.doc.text ?? "") : "";
        return (
          <li key={n} className="rounded-md border border-base-600/40 p-2">
            <span className="font-mono text-small font-semibold">{n}</span>
            {shown ? <Quote>{shown}</Quote> : null}
            <dl>
              <Kv label="Line">{refText(t.line)}</Kv>
              <Kv label="Identity">{refText(t.identity)}</Kv>
              <Kv label="Scene">{refText(t.scene)}</Kv>
              <Kv label="Frame">{refText(t.frame)}</Kv>
              <Kv label="Background">{t.background ?? "not chosen yet"}</Kv>
            </dl>
            <Text label="Alt text" value={t.alt} />
          </li>
        );
      })}
    </ol>
  );
}

/** Approve a draft file or retire an approved one. A refusal (409) is argus-mint's message, word for word. */
function Decision({ projectId, file, off, onDone }: { projectId: string; file: ProjectFile; off: string | null; onDone: () => void }) {
  const [by, setBy] = useState(readReviewer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = catalogueAction(file.status);
  if (!action) return <p className="text-small text-text-muted">Retired: kept so what was made from it still verifies.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-52`} aria-label="Your name, recorded with the decision" placeholder="Your name" value={by} onChange={(e) => setBy(e.target.value)} disabled={Boolean(off)} />
        <Button
          small
          tone={action === "approve" ? "primary" : "danger"}
          disabled={Boolean(off) || busy || !by.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              saveReviewer(by.trim());
              await reviewProjectFile(projectId, file.kind, file.id, file.version, action, by.trim());
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {action === "approve" ? "Approve" : "Retire"} {refText(file)}
        </Button>
        {busy ? <Spinner /> : null}
      </div>
      {error ? (
        <Notice tone="error" className="mt-2">
          argus-mint refused: {error}
        </Notice>
      ) : null}
    </div>
  );
}

function FileCard({
  projectId,
  file,
  detail,
  choices,
  off,
  reload,
}: {
  projectId: string;
  file: ProjectFile;
  detail: ProjectDetail;
  choices: Choices | null;
  off: string | null;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const approvedBy = typeof file.doc.approved_by === "string" ? file.doc.approved_by : null;
  return (
    <Card as="article" className="space-y-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-small font-semibold">{refText(file)}</h3>
        <CatalogueBadge status={file.status} />
        <code className="text-caption text-text-muted">{file.file}</code>
        <span className="ml-auto">
          <Hash value={file.hash} />
        </span>
      </header>
      {approvedBy ? (
        <p className="text-caption text-text-muted">
          Approved by {approvedBy}, {String(file.doc.approved_at ?? "")}
        </p>
      ) : null}
      <DocBody file={file} detail={detail} />
      <details className="text-small">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">SingGuard</summary>
        <div className="mt-2">
          <Verdicts file={file} checks={detail.checks} />
        </div>
      </details>
      <details className="text-small">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">The file as argus-mint sent it</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-base-900 p-2 text-caption">{JSON.stringify(file.doc, null, 2)}</pre>
      </details>
      <div className="flex flex-wrap items-start gap-3 border-t border-base-600/40 pt-3">
        <Decision projectId={projectId} file={file} off={off} onDone={reload} />
        {!editing ? (
          <Button small disabled={Boolean(off) || !choices} onClick={() => setEditing(true)} title={off ?? undefined}>
            {file.status === "draft" ? "Edit" : "Edit as a new version"}
          </Button>
        ) : null}
      </div>
      {editing && choices ? (
        <FileEditor
          projectId={projectId}
          detail={detail}
          kind={file.kind}
          file={file}
          choices={choices}
          disabled={off}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}

function KindSection({
  projectId,
  kind,
  title,
  one,
  detail,
  choices,
  off,
  reload,
}: {
  projectId: string;
  kind: ProjectKind;
  title: string;
  one: string;
  detail: ProjectDetail;
  choices: Choices | null;
  off: string | null;
  reload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const files = filesOf(detail, kind);
  // One project.yaml: the project file is edited, never added beside.
  const canAdd = kind !== "project";
  return (
    <section id={`kind-${kind}`} aria-labelledby={`kind-${kind}-title`} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`kind-${kind}-title`} className="font-display text-subheading font-semibold">
          {title} <span className="text-small font-normal text-text-muted">({files.length})</span>
        </h2>
        {canAdd && !adding ? (
          <Button small disabled={Boolean(off) || !choices} title={off ?? undefined} onClick={() => setAdding(true)}>
            New {one}
          </Button>
        ) : null}
      </div>
      {adding && choices ? (
        <FileEditor
          projectId={projectId}
          detail={detail}
          kind={kind}
          choices={choices}
          disabled={off}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {files.length === 0 ? <p className="text-small text-text-muted">None yet.</p> : null}
      {files.map((f) => (
        <FileCard key={fileKey(f)} projectId={projectId} file={f} detail={detail} choices={choices} off={off} reload={reload} />
      ))}
    </section>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const project = useLoad(() => getProject(id), [id]);
  const choices = useLoad<Choices>(async () => {
    const [frames, templates] = await Promise.all([getFrames(), getTemplates()]);
    return { frames, templates };
  });
  const off = useAuthoring();
  if (project.error) return <Notice tone="error">{project.error}</Notice>;
  if (!project.data) return <Spinner />;
  const detail = project.data;
  const own = projectFile(detail);
  const title = own ? String(own.doc.title ?? id) : id;
  return (
    <>
      <p className="mb-1 text-caption">
        <Link href="/projects" className="text-text-muted hover:text-text-secondary">
          ← Projects
        </Link>
      </p>
      <PageTitle
        aside={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {own ? <CatalogueBadge status={own.status} /> : null}
            <DocLink topic="projects">About teaser projects</DocLink>
          </div>
        }
      >
        {title} <span className="text-small font-normal text-text-muted">({id})</span>
      </PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        A teaser project&apos;s files and their review. Each file is a draft, then approved, then retired; a change is a new version. argus-mint
        checks every save, and nothing renders from a file until it is approved. Statuses, checks and verdicts are argus-mint&apos;s.{" "}
        <DocLink topic="project-review">How a file is approved</DocLink>
      </p>
      {off ? <p className="mb-4 text-small text-text-muted">{off}</p> : null}
      <nav aria-label="Kinds of file" className="mb-4 flex flex-wrap gap-1">
        {PROJECT_KINDS.map(({ kind, title: label }) => (
          <a key={kind} href={`#kind-${kind}`} className="rounded-md px-2.5 py-1.5 text-small text-text-secondary hover:bg-base-700 hover:text-text-primary">
            {label} ({filesOf(detail, kind).length})
          </a>
        ))}
      </nav>
      <div className="space-y-8">
        <ChecksPanel checks={detail.checks} />
        {PROJECT_KINDS.map(({ kind, title: label, one }) => (
          <KindSection key={kind} projectId={id} kind={kind} title={label} one={one} detail={detail} choices={choices.data} off={off} reload={project.reload} />
        ))}
      </div>
      {choices.error ? <Notice tone="error">The editors need the frames and templates: {choices.error}</Notice> : null}
    </>
  );
}

export default function ProjectView() {
  return (
    <Suspense fallback={<Spinner />}>
      <Detail />
    </Suspense>
  );
}
