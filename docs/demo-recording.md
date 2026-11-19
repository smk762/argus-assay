# Recording the hosted demo

The hosted demo (`make pages`, for assay.dragonhound.dev) replays a **data tape**: `scripts/make_tape.mjs` turns `fixture/` into `web/public/data-tape/` (`tape.json` plus the images and fonts), and the page answers every argus-mint call from it, in the browser (`web/src/lib/demoMint.ts`).

`fixture/` is recorded by `scripts/record_demo.py`: argus-mint's real server (`argus-mint serve`, in-process), walked through every review state. With stand-in backends it makes the **Sample data** tape; with the GPU host's darkroom and Ollama it makes a **Recorded** one. `fixture/provenance.json` tells `make tape` which. This page says what each is, and how to record. Every render, pin and on-chain step needs the maintainer's approval first.

## The current tape: recorded 2026-11-16 (re-recorded on argus-mint 0.2.2)

`scripts/record_demo.py --real` with the maintainer's approval, on argus-mint 0.2.2 (commit `aba0d2f`, wire 1.9, the commit `web/schema/pins.json` pins), with `--library` on argus-mint's v3 portrait library and `--cache`. Every draft records `made_with` (argus-mint's version, and darkroom's for a render). The re-record reused the first recording's choices: each render came out byte-identical at its pinned seed (the by-eye check carries over), the bios and the rejected cards' notes were offered from the first recording's accepted ones and checked again, and only the library card and the sample job's images are new. The first recording, on argus-mint 0.2.1.dev (commit `465d8ad`, wire 1.7), was made in bounded GPU windows (`--until`), resumed from `--cache`:

- **Queue:** 20 drafts, at least five behind every status filter: 5 published, 5 approved, 5 rejected, 5 pending (all awaiting the moderator, so the default view shows five), plus the two-card sample job.
- **Renders:** argus-darkroom on the GPU host, under its SFW `default` policy. The first four drafts and the sample job render from `scripts/demo-portrait-v1.yaml`; the other sixteen from `scripts/demo-cast-v1.yaml`. Checkpoint `sdxl/aureanuanceXL_v2`, 1152x896, 25 steps, each at a seed pinned in `record_demo.py`. The library card is a portrait from the library (since the re-record, v3's SD3.5 Large image of group 47).
- **Bios:** Ollama on a separate host, `mistral-nemo:12b-instruct-2407-q4_K_M`, screened by darkroom's text check and the demo's checks below. Each draft shows its attempts and why each missed.
- **Pins, voucher, wallets:** as in the sample below (local CIDs, public test keys). Nothing was pinned or minted.
- **The cast:** people of every gender and of adult ages (thirties, sixties, elderly) and builds; robots (a brass automaton, a salvage walker, a cyborg); a creature (a salamander); living objects (a teapot pouring itself, a would-be spellbook); and the sample job's dragon and stone giant. Every card was checked by eye: one subject where the card has one, and nothing that could read as a teen or a minor. Seeds that missed were re-rolled (`--seed`, or candidate seeds rendered into the cache and picked by eye).
- **Rejected cards** carry a moderator note written against that render (`--reject-notes`): what is actually wrong with it (a floating lantern, two figures, a man beside an ordinary owl for an owlfolk scholar, an office clerk for a sky-pirate, a winged machine for a spellbook).
- **Dropped:** a mushroom-sprite card, after darkroom's age check flagged its first render; the concept went, not just the seed. (Its value is still in demo-cast's role list, unused; removing it changes the template and so every cast render.)
- **Purged:** every render darkroom refused or sent to review in these runs, one record at a time (the dragon's first attempt on each run, two candidate seeds, and the sprite).

## Teaser projects (from argus-mint 0.2.3.dev18, wire 1.11)

`scripts/record_demo.py` authors argus-mint's neutral example project, `example-teasers` (a lighthouse on a stormy coast, from argus-mint's `projects/`), over HTTP as the moderator would from the project page: each of its 8 files is saved as a draft, so argus-mint checks it and SingGuard (darkroom's text pre-flight, under the project's `default` policy) judges its texts as it is saved: the title, both prompts of the scenes, the embodied identity's prompt, each line's text and published wording, and each teaser's alt text (9 texts). Then the project, the `keeper` identity, the `lamp-room` scene and the `keep-it-lit` line are approved; the rest stay drafts, so the teaser links can't be approved yet and the page shows argus-mint's refusal. No spoiler list is configured, so nothing is held. The fixture holds `projects.json` and `projects/example-teasers.json` and no other project, ever.

A real (`--real`) run sends those 9 texts to darkroom's text check on the GPU host, besides the bios'. With stand-ins (`make record-dry`), the stand-in passes every text, so its verdicts are not SingGuard's and never go in the committed fixture.

## A teaser's layers (from argus-mint 0.2.3.dev38, wire 1.15)

After authoring the project, `record_demo.py` (`make_teasers`) walks the example through every layer, over HTTP as the moderator does from assay:

1. **Every file both teasers link is approved:** the project, both identities (`keeper` embodied, `lamp` a viewpoint), both scenes (`lamp-room`, `shoreline`) and both lines. The teaser links v1, which choose no background, stay a draft.
2. **Backgrounds.** One job per scene renders its 3 backgrounds. The last of each set is rejected with a note that says what is wrong with that render (`BG_REJECT_NOTES` in `record_demo.py`, fixed text written by eye: rain falling inside the lamp room, a calm sunset where the shoreline asks for a storm), the other two approved. A rejected background with no note there stops the run.
3. **Teaser links v2** choose the first background of each scene, and are approved.
4. **Teaser drafts.** `T1` paints the keeper into `lamp-room-v1-01` (inpainting). Both reviewers approve it; a post is recorded with the poster token; and it is minted (local pins, a test-key voucher). `T2` (the lamp's view of the shoreline: the background is the art) is approved by the moderator and waits for its owner.
5. **Dumped:** `projects/example-teasers/backgrounds.json` and each background PNG (half size, as every image in the fixture), `tracker.json`, and `training/keeper-v1.json`, the embodied identity's training view. The teaser drafts are in `drafts/` with the cards.

What is real and what isn't:

- **The post record** is the recording's own report, as argus-herald would send one: `where: demo`, no URL. Nothing was posted anywhere.
- **No training step runs.** It needs curator, lens, forge (training on the trusted GPU host) and proof, so the training view is argus-mint's answer for an untrained identity: every step `not_started`, `next: candidates`, `record: null`. The page shows that panel as recorded, with "Run candidates" off (the tape's `identity_training` is false). No candidates, runs or evaluation are shown, because none were recorded, and none are made up.
- **The identity check** isn't configured (no `ARGUS_MINT_PROOF_URL`), so `identity_check` is false. `T1`'s `auto_check.identity` is `skipped` (keeper has no `proof_export`, since no LoRA of it has passed proof), so T1 is held for the moderator. `T2`'s is `skipped` too, as a viewpoint, which passes. With auto-moderation off, both record `held: auto-moderation is off: the moderator decides`.
- **Demo:** the hosted demo shows all of it read-only. Starting a job, reviewing a background, making a teaser draft, recording a post, running the identity check and training are off (503 in `demoMint.ts`; the page disables them first). The mock (`make mock`) reviews backgrounds and records posts in memory. Its teaser draft is a copy of the newest recorded draft of that number, since nothing renders there.

`make record-dry` runs all of it on stand-ins: the stand-in inpainting returns the background unchanged. The dry run's data is what the screenshots in the PR used: `MOCK_FIXTURE=.record-dry make mock`, and `PARITY_FIXTURE=… npx vitest run src/lib/parity.test.ts` runs the parity checks over it.

### The re-record at argus-mint `cb910c6` (needs the maintainer's approval)

`web/schema/pins.json` pins argus-mint `cb910c6` (0.2.3.dev38, wire 1.15). `fixture/` is still the 0.2.2 recording, so `sync.test.ts` fails until it is re-recorded. `make record` with `--cache /home/…/argus-assay-record-cache` (and `--no-render` only if no new render is approved) would do this:

**Already in the cache (no GPU):**
- **19 card renders.** Checked offline: every card request at this pin, keyed as `record_demo.cache_key` does, is in the cache. argus-mint 0.2.3 added `init_image` to every render request, and `cache_key` leaves it out while it is unset; without that, all 19 would miss. The template's hash includes `approved_by`, which a real run stamps `maintainer` and a stand-in run `fixture`, so the 19 hits show only when the check is keyed as a real run (`approved_by: maintainer`); a plain dry run shows 0.
- **22 bios and 5 reject notes,** as before.

**New GPU work, through darkroom on the GPU host:**

| What | Request | Notes |
|---|---|---|
| Sample job, 2 renders | demo-portrait v2, seeds 121 and 122, SDXL `aureanuanceXL_v2`, 1152x896, euler/normal, 25 steps, cfg 6, no LoRA | As in phase 1 |
| `lamp-room` v1 backgrounds 1–3 | SDXL `juggernautXL_ragnarokBy`, 1024x1024, euler/normal, 25 steps, cfg 6, no LoRA (the project has no `style_lora`), seeds 3701882332, 3640844258, 1937172164 | `batch` priority, txt2img. Seeds come from the project, scene, version and n, so they are the dry run's. A safety refusal retries the next derived seed, up to 4 times |
| `shoreline` v1 backgrounds 1–3 | the same checkpoint, sampling and size, seeds 3729655101, 557845662, 192604687 | as above |
| `T1` inpainting | keeper's prompt (`an elderly lighthouse keeper, weathered face, short grey beard, dark oilskin coat, knitted cap`) into `lamp-room-v1-01`, mask over `character_area` 448x704 at (320, 256), denoise 1.0, the scene's checkpoint, sampling and size, **no LoRA** (keeper has none pinned) | The seed comes from the project, `T1` and the real background's sha256, so it is known only once the background renders. It needs a LoRA-free SDXL inpainting workflow in darkroom; argus-mint refuses (409) before rendering if `/models` lacks one. Up to 4 attempts |
| `T2` | none | A viewpoint: the background is the art |

**Text checks (darkroom `/preflight`, no GPU render):**
- 22 bios.
- 9 project texts, as in phase 1.
- The teaser links v2's 2 alt texts, judged again because v2 is a new file: about 33 checks in all.

**Not in this recording:**
- curator, lens, forge and proof (no training step).
- proof `/score`: no identity check runs, because `ARGUS_MINT_PROOF_URL` isn't set and keeper has no `proof_export`. Scoring a real identity check needs a trained, proof-passed LoRA of keeper first: the whole training run, then proof `/score` (ArcFace for `check_metric: identity`) on the GPU. That would be a separate approval.

**Afterwards:**
- Check every background and T1 by eye: no figure in a background, one adult keeper in T1.
- Purge any render darkroom refused.
- Run `make pages`.

`record_demo.py --until` and `--cache` resume as for cards.

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
- **Distinct:** no two cards' bios share a run of 6 words (the names left out), their first two words, or a simile: a 3-word run around "like" or "as" (stemmed, so "dance like sparks" and "dancing like sparks" are one), or "like" comparing to the same word ("like moonlit snow", "like moonlit dew").
- **Varied:** none opens with "In", at most 3 open with the card's name, each holds at most one "like", none uses "dance" (the model's favourite verb) or "blood" (`banned_words`, matched as a prefix, so "dancer" and "bloody" too), none uses an ellipsis (`banned_marks`), each names the card exactly once and closes every quotation it opens, and none ends on a fragment (the last sentence has 4 words or more: `last_sentence_words`).
- **Pronouns:** a bio uses only its card's gender's pronouns: she for female, he for male, they for non-binary (the sample's giant and dragon are non-binary). "Their" is allowed, since it is also plural.

Two checks hold that:

1. **As each bio is written** (`scripts/record_demo.py`): a bio that misses any of these is refused like a flagged one, and argus-mint asks the model again (up to 16 tries). The draft records every attempt with the reason.
2. **On the whole fixture** (`make tape`, and so `make pages`): it reads each card's recorded layout and refuses the tape on any miss. `web/src/lib/static.test.ts` covers the check.

The bio template is `scripts/demo-bio-v1.yaml`: argus-mint's example, asking for three sentences of about 185 characters built from the card's role (its class), heraldry colour, pose and setting, opening on a deed, an object, a sound or a time of day, with the pronouns spelled out per gender and stock phrases ruled out. The card's name never goes to the model (argus-mint's rule): it writes a `{name}` token, and argus-mint puts the name in.

The render templates are `scripts/demo-portrait-v1.yaml`, for the first four drafts and the sample job, and `scripts/demo-cast-v1.yaml`, for the rest of the queue: the same wording with two more variables, age (adults only: thirties and up, every age written as it looks) and build, and a fantasy and science-fiction cast of people of every gender, age and build, robots, creatures and living objects, each worded as it should look. It is a template of its own so the first four keep their renders. `scripts/demo-portrait-v1.yaml` is argus-mint's example-portrait v2 with each role worded the way it should look (one figure; a cyborg with chrome plating and joints rather than a person beside a robot; an invented lantern-bearing priestly order, with real-world religious symbols in the negative prompt; a stone giant and a dragon as creatures, not people). Values still come only from its lists. The portrait library stays on example-portrait v2.

## What runs in the browser

- Moderator and owner reviews ("Approve as demo owner" stands in for the wallet; the hosted demo never asks a real wallet to sign).
- The owner's card editor: the live SVG preview, with recorded text layouts or an approximate one for new text. "Bake" records the edit as argus-mint would, but can't redraw the PNG, so the image stays the same.
- Publishing: it shows the tape's recorded publish result (local CIDs, the fixture's voucher).
- Catalogue approve and retire.
- Prev and Next on a draft's page (buttons and the arrow keys, wrapping, "n of N"), through the queue in the grid's order under the filter it was opened from, carried as `?status=` (a query on the one exported page per draft, so the static export serves it); none means All. The queue reads `?status=` back, and a sample job's page steps through the jobs the same way. The keys are ignored while focus is in a field or a dialog is open.
- Enlarged views: the queue's cards (through the current filter), the sample cards and the library's portraits (through the role filter) open in a viewer with Prev and Next buttons and the arrow keys. It wraps at both ends, so the buttons stay enabled and keep focus.

All of it stays in the tab until a reload.

**Off:**
- Making a draft and rendering samples need a GPU. The New draft form shows, but its button is off with the reason; the sample runner is hidden.
- The frame "Preview on art" is composited by argus-mint, so it is hidden.

## Recording

One command, from this repo, with an argus-mint checkout at the pinned commit (`MINT`, default `../argus-mint`; `web/schema/pins.json`, now `aba0d2f`, 0.2.2, wire 1.9):

```sh
make record MINT=<argus-mint checkout> DARKROOM_URL=<GPU host's argus-darkroom> OLLAMA_URL=<GPU host's Ollama>
```

It checks that darkroom answers and Ollama has the bio model (no GPU work), records into `fixture/` with `--real`, then runs `make pages`, whose tape step re-checks every address and bio. A failed run leaves `fixture/` as it was. Then the Playwright pass at 1440 and 390, light and dark, and commit `fixture/` once the tape is accepted. `LIBRARY=<dir>` serves the portrait library's full images (`argus-mint library build`): the fixture's six groups, whole, on every checkpoint that library has, and the library's own template; without it the fixture's 640 px previews and template stand in.

**Dry run, no GPU:** `make record-dry MINT=...` is the same run (server, cards, prompts, checks) on stand-ins, into `.record-dry/`, then the tape checks. `make sample-fixture` writes it to `fixture/`.

What `--real` does:

### 1. Bios (cheap)
- Ollama's `/api/chat` (it may be on another host than darkroom), with the bio template's model, `mistral-nemo:12b-instruct-2407-q4_K_M` (Mistral NeMo, Apache 2.0). About 8 GB of VRAM.
- 23 bios (21 drafts, two sample cards). With rewrites for the checks, expect 100 to 150 calls of a few seconds each. With `--cache`, a bio that passed is kept (`DIR/bios.json`) and offered first on the next run, checked again like a new one; `--rewrite-bio "Card Name"` writes one afresh. A draft whose bio runs out of tries gets up to 3 rounds.
- darkroom's text check screens every try.

### 2. Renders (GPU host)
- argus-darkroom on the GPU host, demo-portrait's checkpoint `sdxl/aureanuanceXL_v2`. 20 drafts and a two-card sample job: 22 renders at 1152x896, 25 steps (only the ones not in the cache, with `--cache`). The library card is not rendered.
- The run starts no GPU work from :50 to :05 (a scheduled job has the GPU then), waits while darkroom is busy, and retries a render that ran out of memory (60 s apart, up to 5 times). It prints the record ids of any renders darkroom refused, to purge one by one.
- **Re-rolls:** run `scripts/record_demo.py` directly (the `RECORD` line in the Makefile) with `--cache DIR`, which keeps every render and reuses one made for the same request, and `--seed "Card Name=SEED"` for each card to render again. A teaser's figure is re-rolled with `--teaser-seed T1=SEED`: argus-mint derives that seed from the project, the teaser and the background's sha256, so the recorder sets it in its place (the next of argus-mint's derived seeds, say), and the draft records the seed it was painted at. A change to the render template changes every request, so it re-renders everything. `--no-render` (with `--cache`) makes no render at all: a request not in the cache stops the run, naming it, so a bios-only run can't reach the GPU. Refusals are cached too, so a replay takes the same retry path. `--reject-notes DIR` writes each rejected card's image to `DIR/<card>.png` and waits for the moderator's note in `DIR/<card>.txt`, so every note says what is wrong with that render; a note is reused on a later run only while the card's art is unchanged. Never pass `--reject-notes` to a stand-in dry run: its art never matches a recorded note's, so the run deletes that note and waits for a new one.
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
