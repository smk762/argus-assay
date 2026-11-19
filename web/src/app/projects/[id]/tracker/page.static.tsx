import { projectParams } from "@/lib/staticParams";

import TrackerView from "./TrackerView";

// Static demo only (page.live.tsx is the live build's): one exported tracker per project on the tape.
export const generateStaticParams = projectParams;

export default function TrackerPage() {
  return <TrackerView />;
}
