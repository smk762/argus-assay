import type { NextConfig } from "next";

// Two builds from one tree:
//
// - Live (default): a server (`next start`) in front of argus-mint, with the per-request nonce CSP in
//   src/proxy.live.ts. Draft and sample pages render on demand.
// - Static demo (`ASSAY_STATIC=1`, `make pages`): a pure static export to out/ that replays the data
//   tape (NEXT_PUBLIC_ASSAY_TAPE_URL, /data-tape by default; scripts/make_tape.mjs) with no argus-mint.
//   The proxy is named proxy.live.ts, which only the live build's pageExtensions see; draft, sample
//   and catalogue pages (page.static.tsx) are exported for each id on the tape (lib/staticParams.ts), and
//   scripts/csp.mjs then gives every exported page a hash-based CSP.
//
// ASSAY_MINT_PROXY (live only) proxies argus-mint under assay's own origin at /mint, so a browser on
// the LAN needs only assay's port (no second firewall rule, no CORS). Both it and
// NEXT_PUBLIC_MINT_URL=/mint are fixed at BUILD time (Next writes rewrites into the build).
// argus-mint then sees writes from assay's origin: list it in ARGUS_MINT_CORS_ORIGINS.
const staticDemo = process.env.ASSAY_STATIC === "1" || process.env.NEXT_PUBLIC_ASSAY_STATIC === "1";
const proxy = process.env.ASSAY_MINT_PROXY?.replace(/\/+$/, "");

const live: NextConfig = {
  // `next dev` refuses its own assets to any host but localhost. Name the LAN
  // address a dev page is opened as, comma-separated; production needs nothing.
  allowedDevOrigins: (process.env.ASSAY_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Companion headers to the CSP in src/proxy.live.ts, on every response including built assets.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  async rewrites() {
    return proxy ? [{ source: "/mint/:path*", destination: `${proxy}/:path*` }] : [];
  },
};

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // page.static.tsx / page.live.tsx: the dynamic routes differ (one exports a page per tape id, one
  // renders on demand), and proxy.live.ts is the live build's alone.
  pageExtensions: staticDemo ? ["tsx", "ts", "static.tsx"] : ["tsx", "ts", "live.ts", "live.tsx"],
  env: { NEXT_PUBLIC_ASSAY_STATIC: staticDemo ? "1" : "" },
  // The static host sends the headers instead (out/_headers, written by scripts/csp.mjs).
  ...(staticDemo ? { output: "export" as const, trailingSlash: true } : live),
};

export default nextConfig;
