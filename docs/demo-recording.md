# Recording the hosted demo

The hosted demo (`make pages`, for assay.dragonhound.dev) replays a **data tape**: `scripts/make_tape.mjs` turns `fixture/` into `web/public/data-tape/` (`tape.json` plus the images and fonts), and the page answers every argus-mint call from it, in the browser (`web/src/lib/demoMint.ts`).

`fixture/` is recorded by `scripts/record_demo.py`: argus-mint's real server (`argus-mint serve`, in-process), walked through every review state. With stand-in backends it makes the **Sample data** tape; with the GPU host's darkroom and Ollama it makes a **Recorded** one. `fixture/provenance.json` tells `make tape` which. This page says what each is, and how to record. Every render, pin and on-chain step needs the maintainer's approval first.

## The current tape: recorded 2026-11-15

`make record` with the maintainer's approval, on argus-mint 0.2.1.dev (commit `465d8ad`, wire 1.7):

- **Renders:** argus-darkroom on the GPU host, under its SFW `default` policy. Template v2's default checkpoint `sdxl/aureanuanceXL_v2`, 1152x896, 25 steps: four drafts and the two-card sample job (template v3), every one passed on its first attempt. The library card is the portrait library's existing Flux dev image, as before.
- **Bios:** Ollama on a separate host, `mistral-nemo:12b-instruct-2407-q4_K_M`, screened by darkroom's text check. 16 written for 7 kept: the rest missed the length range (each draft shows its attempts and why). They run 161 to 209 characters, 3 or 4 lines.
- **Pins, voucher, wallets:** as in the sample below (local CIDs, public test keys). Nothing was pinned or minted.
- **GPU time:** about 9 minutes over three runs (4.5 for the one that finished). The first stopped when one card's bio missed the range 8 times (the prompt now asks for words, not characters, and allows 16 tries). The second hit an out-of-memory error on the GPU host straight after a scheduled job; the script now waits out :50 to :05, waits while darkroom is busy, and retries a render that ran out of memory.
- **Art against the card:** generated, not curated. Most cards match their class and colour; the Steel Tinker reads as a mechanic rather than a cyborg, the Emerald Wizard shows two figures in red and green, and the sample cards (a giant and a dragon in the prompt) came out as people. The rejected card's moderator note is the script's fixed one.

## What the sample tape is

`make sample-fixture` (no GPU, no network):

| Part | In the sample tape | Real or stand-in |
|---|---|---|
| Card art | Portraits from argus-mint's pre-rendered library (the stand-in renderer returns them), half size, 256 colours | Real renders, made earlier; nothing rendered for the tape |
| Bios | Hand-written, one per card (`BIOS` in `scripts/record_demo.py`), through the same checks a model's bio must pass | Stand-in (no model ran) |
| Card images | Baked by argus-mint (Pillow) in the `card-green` frame | Real |
| Reviews | Moderator `moderator-1`; owner signatures (SIWE) from Anvil's public default account #2 | Real flow, public test key |
| Pins | `LocalPinner`: CIDs computed locally, nothing on IPFS | Stand-in |
| Voucher | EIP-712, signed by Anvil's public default account #1, for the demo Card contract's address on Base Sepolia (chain id 84532) | Real signature, test key, never submitted |

Nothing in it was pinned or minted. The addresses it carries are on the allowlist in `scripts/make_tape.mjs`, each with its reason. The tape refuses any other address, and anything that looks like a key, a token, an RPC URL, a LAN address, an internal hostname or a home path.

## Bios: length and variety

Measured on the `card-green` v1 frame, which every demo card uses (`scripts/bio_fit.json`):

- **The box:** the bio slot is 750 x 318 px of the 969 x 1352 card. Crimson Text Italic at 38 px (argus-mint shrinks it to 22 px only if the text doesn't fit), line height 56 px: 5 lines at full size.
- **Fill** is the drawn text block's height over the box's: 3 lines 51%, 4 lines 69%, 5 lines 86%. The old canned bios were about 110 to 120 characters, 2 or 3 short lines (about 30 to 50%).
- **Target: 160 to 210 characters, drawn at 38 px, 50 to 80% fill.** Wrapped prose runs about 52 characters a line, so that is 4 lines (3 only when packed full). The fifth line and the shrink stay in reserve, so nothing overflows.
- **Every width:** argus-mint bakes the card as one PNG, and the page scales it whole. The fill is the same in the narrowest grid card (210 CSS px, the queue's `minmax(210px, 1fr)`) as on the draft page.
- **Distinct:** no two cards' bios share a run of 6 words (the names left out).

Two checks hold that:

1. **As each bio is written** (`scripts/record_demo.py`): a bio outside the range, or repeating another card's, is refused like a flagged one, and argus-mint asks the model again (up to 8 tries). The draft records every attempt with the reason.
2. **On the whole fixture** (`make tape`, and so `make pages`): it reads each card's recorded layout and refuses the tape on any miss. `web/src/lib/static.test.ts` covers the check.

The bio template is `scripts/demo-bio-v1.yaml`: argus-mint's example, asking for three sentences of 170 to 200 characters built from the card's role (its class), heraldry colour, pose and setting, with stock phrases ruled out. The card's name never goes to the model (argus-mint's rule): it writes a `{name}` token, and argus-mint puts the name in.

## What runs in the browser

- Moderator and owner reviews ("Approve as demo owner" stands in for the wallet; the hosted demo never asks a real wallet to sign).
- The owner's card editor: the live SVG preview, with recorded text layouts or an approximate one for new text. "Bake" records the edit as argus-mint would, but can't redraw the PNG, so the image stays the same.
- Publishing: it shows the tape's recorded publish result (local CIDs, the fixture's voucher).
- Catalogue approve and retire.

All of it stays in the tab until a reload.

**Off:**
- Making a draft and rendering samples need a GPU. The New draft form shows, but its button is off with the reason; the sample runner is hidden.
- The frame "Preview on art" is composited by argus-mint, so it is hidden.

## Recording

One command, from this repo, with an argus-mint checkout at the fixture's wire (`MINT`, default `../argus-mint`; commit `465d8ad`, 0.2.1.dev, wire 1.7):

```sh
make record MINT=<argus-mint checkout> DARKROOM_URL=<GPU host's argus-darkroom> OLLAMA_URL=<GPU host's Ollama>
```

It checks that darkroom answers and Ollama has the bio model (no GPU work), records into `fixture/` with `--real`, then runs `make pages`, whose tape step re-checks every address and bio. A failed run leaves `fixture/` as it was. Then the Playwright pass at 1440 and 390, light and dark, and commit `fixture/` once the tape is accepted. `LIBRARY=<dir>` serves the portrait library's full images (`argus-mint library build`); without it the fixture's 640 px previews stand in.

**Dry run, no GPU:** `make record-dry MINT=...` is the same run (server, cards, prompts, checks) on stand-ins, into `.record-dry/`, then the tape checks. `make sample-fixture` writes it to `fixture/`.

What `--real` does:

### 1. Bios (cheap)
- Ollama's `/api/chat` (it may be on another host than darkroom), with the bio template's model, `mistral-nemo:12b-instruct-2407-q4_K_M` (Mistral NeMo, Apache 2.0). About 8 GB of VRAM.
- Seven bios (five drafts, two sample cards). With rewrites for length or repeats, expect 15 to 25 calls of a few seconds each.
- darkroom's text check screens every try.

### 2. Renders (GPU host)
- argus-darkroom on the GPU host, template v2's default checkpoint `sdxl/aureanuanceXL_v2` (the drafts were on it before). Four drafts and a two-card sample job: 6 renders at 1152x896, 25 steps. The library card is not rendered.
- **Licences to check before publishing renders:**
  - The SDXL finetunes inherit CreativeML Open RAIL++-M, plus each author's own terms on Civitai.
  - FLUX.1 [dev] is under Black Forest Labs' non-commercial licence (only in the library's existing images).
  - The card frame fonts are SIL OFL.
- **Time:** about half a minute per image. Six renders and a retry or two is 3 to 5 minutes, plus model loads.
- **Cost:** the GPU host's power only.

Not part of `make record` (it keeps local pins and the test-key voucher), and each needs its own approval:

### 3. Pins (optional)
- A real IPFS pin makes the CIDs fetchable by anyone, for good. The demo doesn't need that: it serves copies of every image from the tape, and the CSP allows no gateway.
- **Recommendation:** keep `LocalPinner`. The CIDs are computed the same way, so they are still the real content addresses, just not announced.
- If public CIDs are wanted:
  - Pin with the Kubo node argus-mint's mainnet demo used, or a Pinata free tier. Either is free at this size (a few MB).
  - No Pinata token or Kubo URL goes in the tape or the repo.

### 4. Chain (testnet only)
- Publishing signs a voucher off-chain; it needs no transaction. A recording can stop there, at no cost.
- If the demo should show a minted card, use **Base Sepolia** and the existing demo Card contract (`0xCAa3573b5550870A5e15C47c650b8700D70a8fA7`):
  - `argus-mint submit` from the owner's wallet.
  - Faucet ETH covers gas.
  - About a minute per card.
- **Wallets: opsec.**
  - The voucher signer and the owner both appear on the page ("Signed by", "For").
  - Use **fresh throwaway wallets** for both. Grant the signer the Card's signer role on Base Sepolia only.
  - Never use the deployer: on Base mainnet it still holds every role.
  - Add the two new addresses to the allowlist in `scripts/make_tape.mjs`, with their reasons.
  - The contract's Basescan page, which the demo links, shows its deployer as the creator. That link is approved as a demo contract link, but the deployer must not appear anywhere else.

### Estimate

| Step | GPU time | Cost |
|---|---|---|
| Bios (15 to 25 calls, text checks) | 1 to 3 min | none |
| Renders (6, plus retries) | 3 to 5 min | GPU host power |
| Model loads (SDXL and the 12B model, more if they can't share VRAM and swap per card) | 1 to 5 min | none |
| **Total** | **about 10 min (6 to 15)** | GPU host power |
| Pins (optional) | none | none (Kubo or the Pinata free tier) |
| Chain (optional, testnet) | none; about 5 min | none (faucet ETH) |
| Tape, pages and checks | none; about half an hour of work | none |
