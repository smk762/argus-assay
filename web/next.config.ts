import type { NextConfig } from "next";

// Draft and sample pages are dynamic routes, so this is a server (`next start`), not a static export.
//
// ASSAY_MINT_PROXY proxies argus-mint under assay's own origin at /mint, so a browser on the LAN
// needs only assay's port (no second firewall rule, no CORS). Both it and NEXT_PUBLIC_MINT_URL=/mint
// are fixed at BUILD time (Next writes rewrites into the build). argus-mint then sees writes from
// assay's origin: list it in ARGUS_MINT_CORS_ORIGINS.
const proxy = process.env.ASSAY_MINT_PROXY?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // `next dev` refuses its own assets to any host but localhost. Name the LAN
  // address a dev page is opened as, comma-separated; production needs nothing.
  allowedDevOrigins: (process.env.ASSAY_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  async rewrites() {
    return proxy ? [{ source: "/mint/:path*", destination: `${proxy}/:path*` }] : [];
  },
};

export default nextConfig;
