# argus-assay: spec

The standalone review UI for [argus-mint](https://github.com/smk762/argus-mint), as [safelight](https://github.com/smk762/argus-safelight) is for argus-darkroom and [cull](https://github.com/smk762/argus-cull) is for argus-curator. An assay office tests the metal and stamps the hallmark before a coin leaves the mint. Here, people check each card before it is pinned or signed, and each template, frame and bio template before any card uses them.

**The server is the product.** Assay is a client of `argus-mint serve`:
- **It decides nothing.** Statuses, who is still to review, and what the server can do (`/health.capabilities`) all come from argus-mint.
- **It shows the record**, without reclassifying anything.
- **It disables what the server won't do**, and checks again in the API client before sending a write.

## Pages

1. **Review queue** (`/`).
   - **Filters:** drafts by status (pending, approved, rejected, published), plus "Needs the moderator".
   - **Each card shows** the card image, its name, the owner's address, and who is still to review.
2. **Draft** (`/drafts/{id}`).
   - **The image:** the card image the reviewers judge (with its sha256), and the unframed render beside it.
   - **Moderator:** approve or reject with a note, sent with the moderator token. Each role decides once, and a rejection closes the draft.
   - **Owner:**
     - Approve or reject with the wallet the card is minted to.
     - argus-mint issues a Sign-In with Ethereum challenge naming the draft, the decision and the image hash. The wallet signs it and assay relays it.
     - The wallet must be the card's `to`.
   - **Publish:** for an approved draft, pin and sign; then show the CIDs, content hash and voucher.
   - **Customise (owner only):** text fields plus style controls.
     - **Border:** a tint and its strength.
     - **Each text slot:** text colour, an effect (none, shadow, outline or glow) with its colour, and a background (colour, opacity, corner radius, padding).
     - **Colour:** one colour wheel (hue around, saturation outward, a brightness slider, a hex field) sets whichever colour is selected. Any colour is allowed. On the wheel, the arrow keys turn the hue and move the saturation (Shift for finer steps).
     - **Preview:** the card drawn as SVG.
       - The art goes in the window.
       - The overlay goes through an sRGB `feColorMatrix` with `lib/style.tintMatrix`, the same numbers as argus-mint's `frames.tint_matrix`.
       - Text goes where `POST /frames/…/layout` says, in the frame's fonts.
       - Text is set with unhinted advances (`text-rendering: geometricPrecision`), as Pillow lays a line out.
       - A glow is blurred as Pillow blurs it, colour and alpha separately, so it darkens as it fades.
     - **Confirm:** signing with the card's wallet sends one edit, and argus-mint bakes the PNG. That PNG is what the moderator and the owner then review.
     - **The moderator never edits.**
   - **How it was made:** the template, frame, seed, checkpoint, LoRAs, the library entry (when the art came from the library), render attempts, bio and bio attempts, display texts, and reviews.
3. **New draft** (`/new`).
   - Approved templates, frames and bio templates only.
   - Every variable is a dropdown from the template's fixed list. **There is no free-text prompt.**
   - Fields: the name (shown on the card, never sent to a model), the owner's wallet, the asset key and seed, and display text for the frame's own slots (class, stats...).
   - **Art:** *Render now* or *From the library*. The choice is offered only when `/health.capabilities.library` is true.
     - **Render now:** disabled when `/health.backends.darkroom` is false.
       - **Checkpoint:** from the template's own list (`model`, then `models`), grouped by family (the checkpoint's top folder: `sdxl`, `flux`…) when there is more than one. Sent as `model`, and left out for the default.
       - **LoRAs:** from the template's `lora_options` only: those that pair with the chosen checkpoint, each at one of its reviewed weights, at most `max_loras`. Sent as `loras`, and left out when none is picked. The template's own `loras` are shown as always applied.
     - **From the library:** pick an entry, filtered by checkpoint and by any variable. The entry fixes the variables, seed and checkpoint, so they are shown read-only and only `library: <id>` is sent. `/new?library=<id>` preselects one. argus-mint refuses an entry the chosen template wouldn't render exactly, and its message is shown as it is.
   - The bio template is disabled when `/health.capabilities.write_bios` is false.
4. **Library** (`/library`). The pre-rendered portraits, when the server has them.
   - One row per variable combination, one column per checkpoint, with the columns grouped by family when there is more than one. A row uses the same variables and seed on every checkpoint.
   - A portrait opens full size, with a link to make a card from it.
5. **Catalogue** (`/catalogue`, `/catalogue/{template|frame|bio}/{id}/{version}`). Every file, every status, with its hash.
   - **Template:** prompt, negative prompt, variable lists, size and the number of combinations; the default checkpoint and the others allowed; sampling and negative prompt, and each family's own; the LoRAs always applied, and the LoRA options with their weights, trigger words and checkpoints.
   - **Frame:**
     - The overlay with the art window and text slots drawn on it.
     - The best render size for the window, and a warning when square renders would be cropped.
     - A live preview on any draft's or sample's art, with editable name, bio and slot text.
   - **Bio template:** model, system prompt, prompt and limits.
   - **Render samples:** cards from any status of template, frame and bio template, on any of the template's checkpoints and with any of its LoRA options, run as a background job.
   - **Decision:** approve a draft or retire an approved file. argus-mint writes `status`, `approved_by` and `approved_at` into the file. A retired file keeps its hash.
6. **Samples** (`/samples`, `/samples/{id}`). The jobs, polled until done. Each sample shows its framed image, variables, bio, and render and bio attempts, with a link to preview its frame on that art. Samples are never pinned, signed or minted.

## What it does not do

- **No free-text prompts.**
- **No stats.** Display text is the consumer's; argus-mint draws it and doesn't store it as stats.
- **No marketplace, payouts or minting.** The owner's wallet sends the voucher with the consumer's app or `argus-mint submit`.
- **No storing the moderator token beyond the tab** (sessionStorage).

## Wire

- **Types:** generated from argus-mint's `schema/mint-wire.schema.json`, pinned by tag (or commit) and sha256 in `web/schema/pins.json`. `npm run wire:check` fails on drift.
- **Version check:** assay understands wire 1.x and warns when `/health.wire_version` has another major.

## Demo mode

`scripts/mock_mint.mjs` serves `fixture/` (recorded by argus-mint's `scripts/api_fixture.py`) as an argus-mint on :8108, with state in memory:
- reviews, catalogue decisions and publishing stick until it restarts
- samples "render" one every `MOCK_STEP_MS`
- the library is served when the fixture has one (`library.json` and `library/<id>.jpg` thumbnails); a draft from it records the entry, but keeps the fixture's image
- "Approve as demo owner" stands in for the wallet; the mock checks no signature
