# The demo's fixture (recorded)

Recorded responses of argus-mint's real server, `argus-mint serve`, for argus-assay's static demo
(`make pages`) and demo mode (`make mock`). Made by `scripts/record_demo.py`; see
docs/demo-recording.md.

Recorded from argus-mint with real backends: renders and text checks by argus-darkroom, bios by Ollama. Pins are local (non-IPFS) CIDs; the voucher is signed with a public test key for Base Sepolia's demo Card contract. Nothing was pinned or minted.

- At least five drafts in every state, so each of the queue's filters has a page of cards: pending
  (one from the portrait library), approved, rejected (each with the moderator's note on its render),
  published (with its `publish.json` result: pins, metadata, signed voucher). One sample job, of a
  giant and a dragon.
- The first four drafts render from scripts/demo-portrait-v1.yaml, the rest (people, robots,
  creatures and living objects) from scripts/demo-cast-v1.yaml; the library card's template is
  argus-mint's example-portrait v3, the portrait library's own. All three, the card-green frame and the bio template (scripts/demo-bio-v1.yaml)
  are marked approved for the recording. demo-portrait v2 (v1 with one more negative term) and the
  placeholder example-plain frame await catalogue review; the sample job renders v2.
- Every bio fills 50 to 80% of the card's bio box; no two share a run of 6 words, an opening or a
  simile (scripts/bio_fit.json; checked as each is written and again by `make tape`).
- `drafts/<id>/layout.json` is where each line of the card's text sits, and `frames/<id>/<v>/fonts/`
  holds the fonts the frame names (SIL OFL), for the style editor's preview.
- `projects.json` and `projects/<id>.json` are `GET /projects` and `GET /projects/<id>` for argus-mint's
  neutral example teaser project (example-teasers) only, authored over HTTP as the moderator (each text judged by
  SingGuard as it was saved), with every file its two teasers link approved and the teaser links v1 left a
  draft. `projects/<id>/backgrounds.json` is `GET /projects/<id>/backgrounds` (each scene's 3 backgrounds,
  two approved and one rejected) and `backgrounds/<bg>.png` each image; `tracker.json` is
  `GET /projects/<id>/tracker`; `training/<identity>-v<n>.json` is each embodied identity's
  `GET .../training` (no step was run: training needs curator, lens, forge and proof). Its two teaser drafts
  are in `drafts/`: T1 approved, with a post record, and minted; T2 awaiting its owner. The post record is
  the recording's own report (`where: demo`, no URL): nothing was posted anywhere.
- `library.json` is `GET /library` for six whole groups of the portrait library (one entry per
  checkpoint); `library/<id>.jpg` is each entry's 640 px preview.
- Images are half-size, 256-colour previews to keep the fixture small, so their sha256 differs
  from `image_sha256` in the JSON, which refers to the full-size originals.
