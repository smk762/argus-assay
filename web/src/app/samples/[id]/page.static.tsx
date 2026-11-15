import { sampleParams } from "@/lib/staticParams";

import SampleView from "./SampleView";

// Static demo only (page.live.tsx is the live build's): one exported page per sample job on the tape.
export const generateStaticParams = sampleParams;

export default function SampleJobPage() {
  return <SampleView />;
}
