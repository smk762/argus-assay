import { catalogueParams } from "@/lib/staticParams";

import CatalogueView from "./CatalogueView";

// Static demo only (page.live.tsx is the live build's): one exported page per catalogue file on the tape.
export const generateStaticParams = catalogueParams;

export default function CatalogueDetailPage() {
  return <CatalogueView />;
}
