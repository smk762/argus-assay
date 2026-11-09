# Argus Assay

The review UI for [argus-mint](https://github.com/smk762/argus-mint), the way [Safelight](https://github.com/smk762/argus-safelight) is for argus-darkroom and [Cull](https://github.com/smk762/argus-cull) is for argus-curator.

argus-mint turns game art into provenance tokens, and nothing leaves it unreviewed:
- **Cards.** Every card image is approved by the moderator **and** the card's owner before it is pinned or signed.
- **Catalogue.** Every template, frame and bio template is approved before a card can use it.

Assay is where people do that reviewing. **The server is the product:** assay shows what argus-mint recorded and decides nothing itself.

## What it shows

- **Review queue.** Drafts waiting for the moderator, and every other status.
- **A draft.**
  - **The image:** the card image under review, its unframed render, and the bio with every attempt the model made.
  - **Moderator:** approve or reject with the moderator token.
  - **Owner:** approve or reject by signing argus-mint's challenge with the card's wallet.
  - **Publish:** pin and sign once both have approved.
- **New draft.** From approved files only, every variable from its fixed list, no free-text prompt.
- **Catalogue.** Templates, frames and bio templates, with hashes and status.
  - Render sample cards from drafts.
  - See a frame's art window and text slots drawn on it, and preview it on any art.
  - Approve, or retire, with the decision written into the file.
- **Samples.** Sample jobs as they render; never pinned, signed or minted.

The full spec is in [spec.md](spec.md).

## Running it

```bash
make install
make mock      # a stand-in argus-mint on :8108, from the recorded fixture (no GPU, darkroom, IPFS or wallet)
make dev       # assay on http://localhost:3108
```

Against a real server, start argus-mint (`argus-mint serve`, or `make serve-up` in argus-mint) and point assay at it with `NEXT_PUBLIC_MINT_URL`.

argus-mint must list assay's origin in `ARGUS_MINT_CORS_ORIGINS`; `http://localhost:3108` is in its defaults. Owner review needs `ARGUS_MINT_SIWE_DOMAIN` set to assay's host, e.g. `localhost:3108`. The moderator enters the token (`ARGUS_MINT_MODERATOR_TOKEN`) behind the key icon. It is kept for that browser tab only.

In docker: `docker compose up` (with `COMPOSE_PROFILES=mock` from `.env.example` for the mock).

## Develop

```bash
make check     # eslint, tsc, wire types match the pin, vitest, next build
make wire      # regenerate the wire types after changing web/schema/pins.json (npm run wire:pull fetches a new pin)
make fixture   # copy a freshly recorded fixture from ../argus-mint
```

## License

MIT
