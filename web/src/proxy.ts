import { NextResponse, type NextRequest } from "next/server";

/**
 * A strict, nonce-based Content Security Policy for every page. Assay is a moderator surface (it
 * holds the moderator token), so an injected script must not run. Next reads the nonce from the
 * request's CSP header and stamps it on its own scripts; the layout gives it to the theme boot
 * script. Only scripts are locked down: images, styles and connections (argus-mint may be another
 * origin) are left to the defaults.
 */
export function proxy(request: NextRequest) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    // 'unsafe-eval' only in dev: React uses eval there to rebuild server error stacks.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample'${dev ? " 'unsafe-eval'" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not built assets, and not /mint (proxied to argus-mint when ASSAY_MINT_PROXY is set).
      source: "/((?!_next/static|_next/image|favicon.ico|mint/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
