// The Dragonhound Labs family bar, rendered natively from the vendored source (vendor/dh/dh-strip.mjs,
// dh-shared 1.2.11): links, labels and mark come from there, so a re-sync updates it with no hand copy.
// Styles are vendor/dh/dh-strip.css (imported by globals.css). No JS. src/lib/shared.test.ts checks the
// rendered markup against the module's own stripHtml(). Only the static demo build carries it.
//
// Label: "Live demo · runs in your browser" (STRIP_LABEL): the moderator and owner actions run live in the
// tab. The JSX renders only that suffix, as the shared module says to natively (stripHtml({ label })); the
// pasted strip's every-suffix-plus-`hidden` form doesn't work here, since Tailwind's preflight makes
// [hidden] display:none !important. src/app/layout.tsx also sets data-dh-label on <html>, as the family does.
//
// dh-shared lists Assay (since 1.2.5), so its link is marked current. On phones the link list scrolls sideways;
// dh-theme.js (added to the static build by scripts/csp.mjs) scrolls the current link into view.
import { strip } from "../../vendor/dh/dh-strip.mjs";

export const STRIP_SITE = "assay";
/** The label suffix (a key of strip.labelSuffixes). */
export const STRIP_LABEL = "browser";

/** The strip, with this site's link marked current. Same-tab links: *.dragonhound.dev is one family. */
export function DemoStrip({ current = STRIP_SITE, label = STRIP_LABEL }: { current?: string; label?: keyof typeof strip.labelSuffixes }) {
  const { home } = strip;
  return (
    <nav className="dh-strip" aria-label={strip.ariaLabel} data-dh-site={current}>
      <a className="dh-strip-home" href={home.href} data-dh-site={home.site}>
        <svg className="dh-strip-mark" viewBox="0 0 100 100" width="18" height="18" aria-hidden="true" focusable="false">
          <path fillRule="evenodd" d={strip.markPath} />
        </svg>
        <span className="dh-strip-name">{home.label}</span>
      </a>
      <ul className="dh-strip-links">
        {strip.links.map((link) => (
          <li key={link.site}>
            <a href={link.href} data-dh-site={link.site} aria-current={link.site === current ? "page" : undefined}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="dh-strip-label">
        {strip.label}
        <span className="dh-strip-more">{strip.labelSuffixes[label]}</span>
      </p>
    </nav>
  );
}
