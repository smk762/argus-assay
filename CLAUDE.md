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

## Layout

```
web/src/app/          routes: / (queue), drafts/[id], new, catalogue, catalogue/[kind]/[id]/[version], samples, samples/[id]
web/src/components/   Shell, MintProvider (/health poll + token state), Catalogue (DecisionPanel, SampleRunner), bits, ui, icons
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
- **Ports:** argus-mint is on 8108 (the mock too), assay on 3108.
- **Branches:** `main` for now; `dev` + release PRs once it has releases, as in the rest of the suite.
