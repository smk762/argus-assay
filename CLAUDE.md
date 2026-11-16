# CLAUDE.md — argus-assay

The review UI for argus-mint. Human-facing usage is in [README.md](README.md); the page spec is in [spec.md](spec.md).

## Rules

1. **The browser decides nothing.** A draft's status and `awaiting`, a catalogue file's status, and what the server allows (`/health.capabilities`) all come from argus-mint. Don't derive a status, and don't skip a review step in the UI.
2. **Writes are gated in the client** (`lib/api.ts`). Every write calls `requireCapability(...)` against the memoised `/health` before fetching, and throws `CapabilityRefused`. Components also disable controls up front, but the client is the guarantee.
3. **No free-text prompts.** Template variables are dropdowns from the template's lists. The card name and display text go to argus-mint as data; it never sends them to a model.
4. **The moderator token stays in the tab** (`lib/token.ts`, sessionStorage). Never put it in the bundle, localStorage or a URL.
5. **The owner proves it with their wallet.** Assay relays argus-mint's EIP-4361 challenge to `personal_sign` (`lib/wallet.ts`) and posts the signature back. argus-mint checks it; the browser doesn't.
6. **Only the owner changes a card** (text and style, via a signed edit). The moderator approves or rejects. The SVG preview is a preview: the PNG argus-mint bakes is what gets reviewed. Keep `lib/style.tintMatrix` equal to `argus_mint.frames.tint_matrix` (style.test.ts pins the numbers).
7. **Show the record.** Attempts (render and bio), reviews with their notes, and hashes are all shown. A status always has a mark and a word as well as a colour.

## Must never happen

Each row names what catches it. An **UNENFORCED** row gets a check, not more prose; until then it links the issue that tracks one. Source checks live in `web/src/lib/rules.test.ts`.

| Must never happen | Enforced by |
|---|---|
| The browser works out a status or `awaiting`, checks a signature, or skips a review step (rules 1, 5) | `rules.test.ts` "the browser decides nothing" (no status or `awaiting` set or built, no review tallied, no signature library or check, each review panel behind `moderatorCanReview`/`ownerCanReview`/`status`) |
| A write (the moderator's or the owner's) reaches argus-mint before `requireCapability` (rule 2) | `rules.test.ts` "every write is gated…" (finds every poster in `api.ts`); `api.test.ts` "writes are gated on /health…" (behaviour) |
| A template variable typed rather than picked, or a prompt sent (rule 3) | `rules.test.ts` "no free-text prompts" (no prompt field on the wire, via tsc; no text field names a variable or prompt); argus-mint refuses a value not on the template's list |
| The moderator token in localStorage, the bundle or a URL (rule 4) | `rules.test.ts` "the moderator token stays in the tab" |
| Anyone but the owner changes a card (rule 6) | argus-mint: it refuses an edit not signed by the draft's owner |
| The SVG preview's tint drifts from argus-mint's bake (rule 6) | `style.test.ts` "is the same matrix, number for number" |
| A status shown without its mark and word (rule 7) | `rules.test.ts` "a status has a mark and a word" (no bare `{x.status}` in any `.tsx`) |
| An overlay other than `components/Modal.tsx` | `rules.test.ts` "overlays are components/Modal.tsx" |
| An edit to `web/vendor/dh/` | CI `dh-shared` (`sync-shared.mjs --check`) |
| The hosted demo calls argus-mint | `check-static.mjs` (CI `pages`; argus-mint's address in no page but `/docs` prose); `static.test.ts` "reads only the tape" |
| The hosted demo asks a wallet for anything | `wallet.test.ts` "never asks a wallet, even one the page has injected" |
| An explorer link to anything but the Card contract (a wallet's page lists its holdings) | `rules.test.ts` "explorer links name only the Card contract" |
| An address not on `make_tape.mjs`'s allowlist, or a secret, in the tape | `static.test.ts` "refuses an address that isn't on the allowlist, and secrets by name" |
| `demoMint.ts` and `mock_mint.mjs` answering differently | `parity.test.ts` (runs the mock, asks both the same requests: every list, draft and sample job, 404s, a review, catalogue decisions) |
| A static demo page without its CSP | `check-static.mjs` (CI `pages`) |
| Wire types, imported docs or the demo fixture out of step with the pin | `wire:check` (CI `web`); `sync.test.ts`; `mint-drift.yml` flags argus-mint `dev` moving past the pin |
| An imported doc carrying a private IP, a home path or an email | `docs-pull.mjs`'s opsec gate (at import; the hashes in `sync.test.ts` then hold the files) |
| An imported doc running markup or loading anything from elsewhere | `mintDocs.test.ts` "drops raw HTML and unsafe links…", "loads no image" |
| Work pushed to `main`, or `main` ahead of `dev` (Branches) | GitHub ruleset "main: releases from dev only" (a PR is required, no force push or deletion, no bypass); CI `branch-rule.yml` (a PR into `main` only from `dev`; `main` moves only to a `dev` commit or a release merge with its tree) |

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Layout

What the file tree doesn't say:

- `web/src/proxy.live.ts` (the per-request CSP nonce) and `page.live.tsx` exist only in the live build; `page.static.tsx` only in the static demo (`next.config.ts`'s `pageExtensions`).
- `web/vendor/dh/` is the Dragonhound shared layer, vendored unedited: re-sync it, never edit it.
- `scripts/make_tape.mjs` builds the static demo's tape from `fixture/` and refuses unlisted addresses and secrets.
- `fixture/` is recorded with real backends by `scripts/record_demo.py` (docs/demo-recording.md), not copied from argus-mint.

## Conventions

- **Same stack as safelight:** Next 16, React 19, Tailwind 4, vitest. Tokens and `ui.tsx` primitives are copied from safelight so the suite looks alike.
- **Tests cover `src/lib`** (node environment), including the source checks in `rules.test.ts`.
- **Wire bumps:**
  1. Change the pin in `web/schema/pins.json`, then run `npm run wire:pull` and fix what typecheck reports.
  2. Run `make docs-pull` (argus-mint's docs at that commit into `web/docs/mint/`, with a sha256 each) and set `mint.version` to the package version at that commit.
  3. Re-record `fixture/` at that commit (`scripts/record_demo.py`, docs/demo-recording.md). `make fixture` instead copies argus-mint's stand-in API fixture, which replaces the recorded demo.
  4. The pin is argus-mint's `dev` HEAD, by full commit sha (the `tag` field takes a sha), not a release tag: wire types, imported docs and the recorded demo data all track the tip of `dev` together (argus-studio#169's sync rule, as argus-sightline does). Bump them together in one PR: `web/src/lib/sync.test.ts` fails `make check` when the fixture's recorded version (`health.json`, each draft's `made_with`) isn't the pin's `version`, or a doc no longer matches its hash. A re-record from the cache (`scripts/record_demo.py --no-render`, docs/demo-recording.md) needs no GPU; new renders still need the maintainer's approval first.
- **Web platform:** the [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill is the reference for HTML/CSS/client JS (install it locally as a Claude Code plugin, or `npx modern-web-guidance@latest install`; its files aren't committed). House exceptions:
  - **Overlays are `components/Modal.tsx`**, a native `<dialog>` opened with `showModal()`, with its own focus and Esc handling.
  - **The CSP is nonce-based** (`src/proxy.live.ts`), so every page renders dynamically. The static demo build instead gets a hash-based CSP per page (`web/scripts/csp.mjs`) and no proxy. An inline `<script>` needs the layout's `nonce`; anything else is refused. Only scripts, objects, `base`, forms and framing are restricted: argus-mint's origin is configurable and images arrive as `blob:` URLs.
  - **Theme is the Dragonhound family's** `public/dh-theme.js` (a copy of `vendor/dh/dh-theme.js`): `data-theme` on `<html>` from the shared `dh-theme` cookie, set before first paint. Colours come from `vendor/dh/dh-tokens.css`, mapped onto the page's names in `globals.css`.
  - **Images:** the page's main image gets `fetchPriority="high"` and is never lazy; grids lazy-load all but the first.
- **Ports:** argus-mint is on 8108 (the mock too), assay on 3108.
- **Static demo** (`make pages`): `lib/demoMint.ts` mirrors `scripts/mock_mint.mjs` in the browser; change both together. A new address in the fixture goes on `make_tape.mjs`'s allowlist with its reason. Its CSP requires Trusted Types, so a page that sets `innerHTML` (`/docs`) is reached by a full page load (`<a>`), never a client navigation.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`: `main` must never be ahead of `dev`, with one exception. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. `main` is protected here (the ruleset above), so the release is a PR from `dev` into `main`, and merging it leaves a merge commit on `main` alone. That merge commit is the one exception to the rule: it leaves `main` one commit ahead of `dev` with an identical tree. Leave it there and don't merge `main` back into `dev`. Anything else on `main` that `dev` lacks is a mistake (`git diff origin/dev origin/main` must be empty). Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.
