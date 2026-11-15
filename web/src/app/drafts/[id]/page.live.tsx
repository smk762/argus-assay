import DraftView from "./DraftView";

// Live: any id, rendered on demand. The static demo uses page.static.tsx, which exports one page per
// draft on the tape (next.config.ts picks the file by pageExtensions).
export default function DraftPage() {
  return <DraftView />;
}
