"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CatalogueBadge, DocLink, PageTitle, useLoad } from "@/components/bits";
import { useMint } from "@/components/MintProvider";
import { NewProject, type Choices } from "@/components/ProjectEditors";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { getFrames, getProjects, getTemplates } from "@/lib/api";
import { staticDemo } from "@/lib/demo";

export default function ProjectsPage() {
  const router = useRouter();
  const { health, hasToken } = useMint();
  const list = useLoad(() => getProjects());
  const [adding, setAdding] = useState(false);
  const choices = useLoad<Choices | null>(
    () => (adding ? Promise.all([getFrames(), getTemplates()]).then(([frames, templates]) => ({ frames, templates, backgrounds: [] })) : Promise.resolve(null)),
    [adding],
  );
  const off = !health?.capabilities.author_catalogue
    ? staticDemo()
      ? "This demo shows the recorded project; authoring needs a running argus-mint."
      : "This server can't write project files (no moderator token is set on it, its projects directory isn't writable, or it is read-only)."
    : !hasToken
      ? "Set the moderator token (key icon) to author."
      : null;
  return (
    <>
      <PageTitle aside={<DocLink topic="projects">About teaser projects</DocLink>}>Teaser projects</PageTitle>
      <p className="mb-4 max-w-3xl text-small text-text-secondary">
        A teaser is an image with a quote on it, built only from reviewed files: the project, its identities, scenes and lines, and the teaser
        links that put them together. Each file is reviewed like a template before anything is made from it.
      </p>
      {list.error ? <Notice tone="error">{list.error}</Notice> : null}
      {!list.data && !list.error ? <Spinner /> : null}
      {list.data ? (
        list.data.projects.length ? (
          <ul className="mb-6 space-y-2">
            {list.data.projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block">
                  <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:border-interactive">
                    <span className="font-medium">{p.title}</span>
                    <CatalogueBadge status={p.status} />
                    <code className="text-caption text-text-muted">{p.id}</code>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-small text-text-muted">No projects on this server.</p>
        )
      ) : null}
      {adding ? (
        choices.data ? (
          <Card>
            <NewProject
              choices={choices.data}
              disabled={off}
              onSaved={(saved) => router.push(`/projects/${encodeURIComponent(saved.file.id)}`)}
              onCancel={() => setAdding(false)}
            />
          </Card>
        ) : choices.error ? (
          <Notice tone="error">{choices.error}</Notice>
        ) : (
          <Spinner />
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={Boolean(off)} onClick={() => setAdding(true)}>
            New project
          </Button>
          {off ? <span className="text-small text-text-muted">{off}</span> : null}
        </div>
      )}
    </>
  );
}
