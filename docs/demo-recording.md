# Recording the hosted demo

The hosted demo (`make pages`, for assay.dragonhound.dev) replays a **data tape**: `scripts/make_tape.mjs` turns `fixture/` into `web/public/data-tape/` (`tape.json` plus the images and fonts), and the page answers every argus-mint call from it, in the browser (`web/src/lib/demoMint.ts`).

Today the tape is argus-mint's API fixture, so the page labels it **Sample data**. This page says what that fixture is, what a real recording would need, and what it would cost. **Nothing here has been run.** Every render, pin and on-chain step below needs the maintainer's approval first.

## What the sample tape is

`fixture/` comes from argus-mint's `scripts/api_fixture.py` (copied with `make fixture`). It runs the real `argus-mint serve` in-process with stand-in backends:

| Part | In the sample tape | Real or stand-in |
|---|---|---|
| Card art | Portraits from argus-mint's pre-rendered library (the stand-in renderer returns them), half size, 256 colours | Real renders, made earlier; nothing rendered for the tape |
| Bios | Four canned sentences | Stand-in (no model ran) |
| Card images | Baked by argus-mint (Pillow) in the `card-green` frame | Real |
| Reviews | Moderator `moderator-1`; owner signatures (SIWE) from a throwaway `Account.create()` wallet whose key is discarded | Real flow, throwaway wallet |
| Pins | `LocalPinner`: CIDs computed locally, nothing on IPFS | Stand-in |
| Voucher | EIP-712, signed by Anvil's public default account #1, for the demo Card contract's address on Base Sepolia (chain id 84532) | Real signature, test key, never submitted |

Nothing in it was pinned or minted. The addresses it carries are on the allowlist in `scripts/make_tape.mjs`, each with its reason. The tape refuses any other address, and anything that looks like a key, a token, an RPC URL, a LAN address, an internal hostname or a home path.

## What runs in the browser

- Moderator and owner reviews ("Approve as demo owner" stands in for the wallet; the hosted demo never asks a real wallet to sign).
- The owner's card editor: the live SVG preview, with recorded text layouts or an approximate one for new text. "Bake" records the edit as argus-mint would, but can't redraw the PNG, so the image stays the same.
- Publishing: it shows the tape's recorded publish result (local CIDs, the fixture's voucher).
- Catalogue approve and retire.

All of it stays in the tab until a reload.

**Off:**
- Making a draft and rendering samples need a GPU. The New draft form shows, but its button is off with the reason; the sample runner is hidden.
- The frame "Preview on art" is composited by argus-mint, so it is hidden.

## What a real recording needs

A recorded tape (`node scripts/make_tape.mjs --kind recorded --fixture <dir>`) is the same responses, from a run with real backends. Steps, in order of cost:

### 1. Bios (cheap, local)
- argus-mint's bio writer on Ollama with the template's model, `mistral-nemo:12b-instruct-2407-q4_K_M` (Mistral NeMo, Apache 2.0).
- About 8 GB of VRAM, or CPU at a few seconds per bio. Darkroom screens each bio.
- Five drafts plus a sample job is under a minute of GPU time.

### 2. Renders (GPU host)
- argus-darkroom on the GPU host, with the template's checkpoints. Template v2 defaults to `sdxl/aureanuanceXL_v2` and offers six more SDXL finetunes and `flux1-dev-fp8`.
- **Licences to check before publishing renders:**
  - The SDXL finetunes inherit CreativeML Open RAIL++-M, plus each author's own terms on Civitai.
  - FLUX.1 [dev] is under Black Forest Labs' non-commercial licence.
  - The card frame fonts are SIL OFL.
- **Recommendation:** record the drafts on one SDXL checkpoint whose terms allow a public demo, and keep the library's existing images (already rendered) for the library page.
- **Time:** about half a minute per image with its bio. Five drafts, a two-card sample job and a retry or two is 5 to 10 minutes of GPU, plus model loads.
- **Cost:** the GPU host's power only.

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

### 5. Recording and checks
1. Run a copy of `api_fixture.py` with the real backends (darkroom renderer, Ollama writer, the chosen pinner and the throwaway signer) against `argus-mint serve`.
2. `make tape` with `--kind recorded --fixture <that dir>`, then `make pages`, then the Playwright pass at 1440 and 390, light and dark.
3. Keep the tape out of git, as now (`make pages` builds it from the fixture). Commit the new fixture only after the allowlist check passes.

### Estimate

| Step | Time | Cost |
|---|---|---|
| Bios | under 1 min | none |
| Renders | 10 to 20 min, with model loads | GPU host power |
| Pins (optional) | minutes | none (Kubo or the Pinata free tier) |
| Chain (optional, testnet) | about 5 min | none (faucet ETH) |
| Recording, tape and checks | about an hour of work | none |
