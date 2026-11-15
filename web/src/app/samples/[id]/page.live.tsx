import SampleView from "./SampleView";

// Live: any id, rendered on demand. The static demo uses page.static.tsx, which exports one page per
// sample job on the tape (next.config.ts picks the file by pageExtensions).
export default function SampleJobPage() {
  return <SampleView />;
}
