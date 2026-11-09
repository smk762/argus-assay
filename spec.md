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
     - **Colour:** one colour wheel (hue around, saturation outward, a brightness slider, a hex field) sets whichever colour is selected. Any colour is allowed.
     - **Preview:** the card drawn as SVG.
       - The art goes in the window.
       - The overlay goes through an sRGB `feColorMatrix` with `lib/style.tintMatrix`, the same numbers as argus-mint's `frames.tint_matrix`.
       - Text goes where `POST /frames/…/layout` says, in the frame's fonts.
     - **Confirm:** signing with the card's wallet sends one edit, and argus-mint bakes the PNG. That PNG is what the moderator and the owner then review.
     - **The moderator never edits.**
   - **How it was made:** the template, frame, seed, render attempts, bio and bio attempts, display texts, and reviews.
3. **New draft** (`/new`).
   - Approved templates, frames and bio templates only.
   - Every variable is a dropdown from the template's fixed list. **There is no free-text prompt.**
   - Fields: the name (shown on the card, never sent to a model), the owner's wallet, the asset key and seed, and display text for the frame's own slots (class, stats...).
4. **Catalogue** (`/catalogue`, `/catalogue/{template|frame|bio}/{id}/{version}`). Every file, every status, with its hash.
   - **Template:** prompt, negative prompt, variable lists, sampling, size and the number of combinations.
   - **Frame:**
     - The overlay with the art window and text slots drawn on it.
     - The best render size for the window, and a warning when square renders would be cropped.
     - A live preview on any draft's or sample's art, with editable name, bio and slot text.
   - **Bio template:** model, system prompt, prompt and limits.
   - **Render samples:** cards from any status of template, frame and bio template, run as a background job.
   - **Decision:** approve a draft or retire an approved file. argus-mint writes `status`, `approved_by` and `approved_at` into the file. A retired file keeps its hash.
5. **Samples** (`/samples`, `/samples/{id}`). The jobs, polled until done. Each sample shows its framed image, variables, bio, and render and bio attempts, with a link to preview its frame on that art. Samples are never pinned, signed or minted.

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
- "Approve as demo owner" stands in for the wallet; the mock checks no signature
