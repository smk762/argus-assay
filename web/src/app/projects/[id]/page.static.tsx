import { projectParams } from "@/lib/staticParams";

import ProjectView from "./ProjectView";

// Static demo only (page.live.tsx is the live build's): one exported page per project on the tape.
export const generateStaticParams = projectParams;

export default function ProjectPage() {
  return <ProjectView />;
}
