import CatalogueView from "./CatalogueView";

// Live: any file, rendered on demand. The static demo uses page.static.tsx, which exports one page per
// catalogue file on the tape (next.config.ts picks the file by pageExtensions).
export default function CatalogueDetailPage() {
  return <CatalogueView />;
}
