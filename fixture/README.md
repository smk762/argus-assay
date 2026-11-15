# The demo's fixture (recorded)

Recorded responses of argus-mint's real server, `argus-mint serve`, for argus-assay's static demo
(`make pages`) and demo mode (`make mock`). Made by `scripts/record_demo.py`; see
docs/demo-recording.md.

Recorded from argus-mint with real backends: renders and text checks by argus-darkroom, bios by Ollama. Pins are local (non-IPFS) CIDs; the voucher is signed with a public test key for Base Sepolia's demo Card contract. Nothing was pinned or minted.

- One draft per state: pending (one rendered, one from the portrait library), approved, rejected,
  published (with its `publish.json` result: pins, metadata, signed voucher). One sample job, of a
  giant and a dragon.
- The drafts' render template is scripts/demo-portrait-v1.yaml; the library card's is argus-mint's
  example-portrait v2. Both, the card-green frame and the bio template (scripts/demo-bio-v1.yaml)
  are marked approved for the recording. demo-portrait v2 (v1 with one more negative term) and the
  placeholder example-plain frame await catalogue review; the sample job renders v2.
- Every bio fills 50 to 80% of the card's bio box; no two share a run of 6 words, an opening or a
  simile (scripts/bio_fit.json; checked as each is written and again by `make tape`).
- `drafts/<id>/layout.json` is where each line of the card's text sits, and `frames/<id>/<v>/fonts/`
  holds the fonts the frame names (SIL OFL), for the style editor's preview.
- `library.json` is `GET /library` for six whole groups of the portrait library (one entry per
  checkpoint); `library/<id>.jpg` is each entry's 640 px preview.
- Images are half-size, 256-colour previews to keep the fixture small, so their sha256 differs
  from `image_sha256` in the JSON, which refers to the full-size originals.
