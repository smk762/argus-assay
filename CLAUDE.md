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

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Layout

```
web/src/app/          routes: / (queue), drafts/[id], new, library, catalogue, catalogue/[kind]/[id]/[version], samples, samples/[id]
web/src/components/   Shell, MintProvider (/health poll + token state), Catalogue (DecisionPanel, SampleRunner), LibraryPicker, Checkpoints (CheckpointOptions, LoraPicker), Modal, bits, ui, icons
web/src/proxy.ts      per-request CSP nonce (Next's Proxy, formerly middleware)
web/src/lib/          api (fetch client + capability gate), config (mintUrl), token, wallet, status, slots, generated/mint.ts
web/schema/           mint-wire.schema.json + pins.json (argus-mint repo, tag or commit, sha256)
web/scripts/          wire-types.mjs (same as argus-studio's)
scripts/mock_mint.mjs stand-in argus-mint over fixture/ for demo mode
fixture/              recorded responses from argus-mint's scripts/api_fixture.py (`make fixture`)
```

## Conventions

- **Same stack as safelight:** Next 16, React 19, Tailwind 4, vitest. Tokens and `ui.tsx` primitives are copied from safelight so the suite looks alike.
- **Tests cover `src/lib`** (node environment): status logic, slot geometry, the capability gate, wallet helpers.
- **Wire bumps:**
  1. Change the pin in `web/schema/pins.json`, then run `npm run wire:pull` and fix what typecheck reports.
  2. Run `make fixture` if responses changed shape.
  3. While argus-mint has no release with the server, the pin is a commit; move it to the release tag once there is one.
- **Web platform:** the [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill is the reference for HTML/CSS/client JS (install it locally as a Claude Code plugin, or `npx modern-web-guidance@latest install`; its files aren't committed). House exceptions:
  - **Overlays are `components/Modal.tsx`**, a native `<dialog>` opened with `showModal()`. Don't hand-roll `role="dialog"` overlays, focus traps or Esc handlers.
  - **The CSP is nonce-based** (`src/proxy.ts`), so every page renders dynamically. An inline `<script>` needs the layout's `nonce`; anything else is refused. Only scripts, objects, `base`, forms and framing are restricted: argus-mint's origin is configurable and images arrive as `blob:` URLs.
  - **Theme stays on `data-theme`** (shared with safelight), not the guide's `<meta>`-driven `:has()` selectors. The `color-scheme` meta is kept in step by the boot script and `lib/theme.ts` so the canvas is right before CSS loads.
  - **Images:** the page's main image gets `fetchPriority="high"` and is never lazy; grids lazy-load all but the first.
- **Ports:** argus-mint is on 8108 (the mock too), assay on 3108.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`: `main` must never be ahead of `dev`, with one exception. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected, the release is a reviewed PR from `dev` into `main`, and merging it leaves a merge commit on `main` alone. That merge commit is the one exception to the rule: it leaves `main` one commit ahead of `dev` with an identical tree. Leave it there and don't merge `main` back into `dev`. Anything else on `main` that `dev` lacks is a mistake (`git diff origin/dev origin/main` must be empty). Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.
