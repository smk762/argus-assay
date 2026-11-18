import ProjectView from "./ProjectView";

// Live: any project, rendered on demand. The static demo uses page.static.tsx, which exports one page per
// project on the tape (next.config.ts picks the file by pageExtensions).
export default function ProjectPage() {
  return <ProjectView />;
}
