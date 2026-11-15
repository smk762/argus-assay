# The demo's fixture (sample)

Recorded responses of argus-mint's real server, `argus-mint serve`, for argus-assay's static demo
(`make pages`) and demo mode (`make mock`). Made by `scripts/record_demo.py`; see
docs/demo-recording.md.

argus-mint's real server with stand-in backends: art from the portrait library, hand-written bios, local (non-IPFS) CIDs, a public test-key owner and Base Sepolia's chain id. Nothing was pinned or minted.

- One draft per state: pending (one rendered, one from the portrait library), approved, rejected,
  published (with its `publish.json` result: pins, metadata, signed voucher). One sample job.
- The template (example-portrait v2), the card-green frame and the bio template
  (scripts/demo-bio-v1.yaml) are marked approved for the recording. Template v3 (v2 with one more
  negative term) and the placeholder example-plain frame await catalogue review.
- Every bio fills 50 to 80% of the card's bio box, and no two share a run of 6 words
  (scripts/bio_fit.json; checked as each is written and again by `make tape`).
- `drafts/<id>/layout.json` is where each line of the card's text sits, and `frames/<id>/<v>/fonts/`
  holds the fonts the frame names (SIL OFL), for the style editor's preview.
- `library.json` is `GET /library` for six whole groups of the portrait library (one entry per
  checkpoint); `library/<id>.jpg` is each entry's 640 px preview.
- Images are half-size, 256-colour previews to keep the fixture small, so their sha256 differs
  from `image_sha256` in the JSON, which refers to the full-size originals.
