import { draftParams } from "@/lib/staticParams";

import DraftView from "./DraftView";

// Static demo only (page.live.tsx is the live build's): one exported page per draft on the tape.
export const generateStaticParams = draftParams;

export default function DraftPage() {
  return <DraftView />;
}
