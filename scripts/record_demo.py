"""Record the hosted demo's fixture: argus-mint's real server, walked through every review state.

    uv run --project $MINT python scripts/record_demo.py [--real] [--out fixture] [--library DIR]

MINT is an argus-mint checkout (its own environment: `uv sync --all-extras` there). The run is a
copy of argus-mint's scripts/api_fixture.py with two changes for the demo: the bio template is
scripts/demo-bio-v1.yaml, and every bio must fill the card's bio box (scripts/bio_fit.json) and
share no run of 6 words with another card's. A bio that misses is rejected and argus-mint asks
the writer again, so the draft records each attempt.

Backends:
  default    stand-ins, no network and no GPU: art is the library's images, bios are the
             hand-written ones in BIOS below. This is the sample fixture, and the dry run of a
             real recording: the same server, cards, prompts and checks.
  --real     the GPU host: renders and the text check from argus-darkroom at $DARKROOM_URL, bios
             from Ollama at $OLLAMA_URL (its /api/chat). Pins stay local and the voucher is signed
             with a public test key, as in the sample, so nothing is pinned or minted.

The library (whole groups of portraits, one per checkpoint) is the one in the current fixture.
`--library DIR` serves full images from a built library (`argus-mint library build`); without
it the fixture's 640 px previews stand in, and their sha256 is the one recorded.

Writes OUT/ (default fixture/) in the shape `make tape` reads, plus OUT/provenance.json (the
tape's kind and note). The owner is Anvil's public default account #2 and the voucher signer
#1: test keys anyone can derive, so the tape shows no wallet of the maintainer's.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
import yaml
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from PIL import Image

from argus_mint.bios import BioError
from argus_mint.darkroom import DarkroomClient
from argus_mint.frames import layout, load_frame
from argus_mint.library import MANIFEST, LibraryEntry, Manifest
from argus_mint.pin import LocalPinner
from argus_mint.render import GenResult
from argus_mint.server import Settings, create_app
from argus_mint.templates import RenderRequest, Template, fill

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIT = json.loads((HERE / "bio_fit.json").read_text())
TOKEN = "fixture-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
CARD = "0xCAa3573b5550870A5e15C47c650b8700D70a8fA7"  # argus-mint's demo Card contract, Base Sepolia
FLUX = "flux/flux1-dev-fp8.safetensors"
THUMB = 640
# Anvil's public default accounts #1 and #2: published test keys, never funded on a real chain.
SIGNER = Account.from_key("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
OWNER = Account.from_key("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a")
BIO_ID = {"id": "demo-bio", "version": 1}

CARDS = [  # name, variables, display text, what happens to it
    ("Emerald Wizard", {"gender": "female", "role": "wizard", "colour": "emerald", "pose": "casting a spell",
                        "background": "library"}, {"class": "Wizard · Emerald", "stats": "No. 1"}, "published"),
    ("Steel Tinker", {"gender": "non-binary", "role": "cyborg", "colour": "steel",
                      "pose": "repairing", "background": "workshop"}, {"class": "Cyborg · Steel", "stats": "No. 2"}, "pending"),
    ("Azure Stormcaller", {"gender": "male", "role": "wizard", "colour": "azure", "pose": "casting a spell",
                           "background": "temple"}, {"class": "Wizard · Azure", "stats": "No. 3"}, "approved"),
    ("Lantern Keeper", {"gender": "female", "role": "priest", "colour": "gold", "pose": "praying",
                        "background": "temple"}, {"class": "Priest · Gold", "stats": "No. 4"}, "rejected"),
]  # fmt: skip
LIBRARY_NAME = "Library Pick"
SAMPLE = {"count": 2, "seed": 3, "name": "Sample", "texts": {"class": "Sample class", "stats": "No. 0"}}

# The stand-in writer's bios, one per card: (words the prompt must hold, the bio). Hand-written for
# the sample fixture; each passes the same checks a model's bio must.
BIOS = [
    (("wizard", "emerald", "library"),
     "{name} reshelves the library by spell, and the books, flattered, line up by colour. Her emerald "
     "sleeves are stuffed with bookmarks. She has never once been shushed, though she keeps trying."),
    (("cyborg", "steel", "workshop"),
     "{name} oils every hinge in the workshop before breakfast, their own knees included. Steel fingers "
     "hum as they solder, and the kettle, rebuilt twice, now whistles in three keys."),
    (("wizard", "azure", "temple"),
     "Drizzle for gardens, snow for birthdays: {name} calls down weather on request. In the temple his "
     "azure robes crackle faintly, and the bell ringers give him a wide, polite berth."),
    (("priest", "gold", "praying"),
     "{name} prays in a whisper so the temple mice can sleep. Her gold vestments catch the dawn and "
     "pass it on to whoever needs it most. Candles lean her way whenever she walks by."),
    (("knight", "gold", "academy"),
     "At the academy gate stands {name}, polishing gold armour between lessons. Every winter the "
     "students borrow the shield as a sled. The knight pretends not to notice, and waxes it."),
    (("giant", "silver", "garden"),
     "{name} sips tea from a silver bucket in the garden, minding the snails. Hedges reach the giant's "
     "knees and roses the ankles. Bees settle on that wide hat and stay all afternoon."),
    (("dragon", "obsidian", "weaving"),
     "For chilly villages, {name} weaves scarves of obsidian thread, warming each stitch with a breath. "
     "The dragon's tail keeps the yarn tidy. Nobody has yet dared to ask for socks."),
]  # fmt: skip


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower().replace("{name}", " "))


def shared_run(a: str, b: str, n: int) -> str | None:
    """A run of ``n`` words that ``a`` and ``b`` share (the name left out), or None."""
    wa, wb = words(a), words(b)
    grams = {tuple(wb[i : i + n]) for i in range(len(wb) - n + 1)}
    for i in range(len(wa) - n + 1):
        if tuple(wa[i : i + n]) in grams:
            return " ".join(wa[i : i + n])
    return None


class FitGuard:
    """argus-mint's text guard, plus the demo's: the bio fills its box, and no other card's repeats in it.

    ``inner`` is darkroom's text check (or a stand-in). ``name`` is the card being written; the
    check runs on the text with its ``{name}`` token, as argus-mint passes it.
    """

    def __init__(self, inner, frame_path: Path):
        self.inner, self.frame = inner, load_frame(frame_path)
        self.slot = self.frame.frame.texts[FIT["slot"]]
        self.name = ""
        self.taken: list[tuple[str, str]] = []  # (card name, bio with the token) already on a card
        self.checked = 0

    def measure(self, text: str) -> tuple[int, int, float]:
        """(characters, lines, fill) of ``text`` with the real name, as argus-mint lays it out."""
        final = text.replace("{name}", self.name)
        lay = layout(self.frame, {FIT["slot"]: final})[FIT["slot"]]
        if lay["size"] < self.slot.size:
            return len(final), len(lay["lines"]), 1.0 + (self.slot.size - lay["size"])  # shrunk: over by definition
        line_h = round((lay["ascent"] + lay["descent"]) * self.slot.line_spacing)
        block = line_h * (len(lay["lines"]) - 1) + lay["ascent"] + lay["descent"]
        return len(final), len(lay["lines"]), block / self.slot.height

    def problem(self, text: str) -> str | None:
        chars, lines, fill_ = self.measure(text)
        if not FIT["min_chars"] <= chars <= FIT["max_chars"]:
            return f"{chars} characters; the bio box wants {FIT['min_chars']} to {FIT['max_chars']}"
        if not FIT["min_fill"] <= fill_ <= FIT["max_fill"]:
            return f"fills {fill_:.0%} of the bio box ({lines} lines); it wants {FIT['min_fill']:.0%} to {FIT['max_fill']:.0%}"
        for other, prev in self.taken:
            run = shared_run(text, prev, FIT["shared_words"])
            if run:
                return f'repeats "{run}" from {other}\'s bio'
        return None

    def check_text(self, text: str) -> tuple[bool, str]:
        self.checked += 1
        why = self.problem(text)
        if why:
            print(f"  bio for {self.name} rejected: {why}", file=sys.stderr)
            return False, f"demo fit: {why}"
        ok, detail = self.inner.check_text(text)
        if ok:
            self.taken.append((self.name, text))
        return ok, detail


class StandInDarkroom:
    """Art from the library, every bio passed. No network."""

    def __init__(self, images: list[bytes]):
        self.images, self.n = images, 0

    def generate(self, req: RenderRequest) -> GenResult:
        self.n += 1
        return GenResult.ok(self.images[(self.n - 1) % len(self.images)], ref=f"stand-in-{self.n}")

    def check_text(self, text: str) -> tuple[bool, str]:
        return True, ""


class StandInWriter:
    """The hand-written bio for the card the prompt describes."""

    calls = 0

    def write(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> str:
        StandInWriter.calls += 1
        low = prompt.lower()
        for keys, bio in BIOS:
            if all(k in low for k in keys):
                return bio
        raise BioError(f"no hand-written bio for: {prompt}")


class OllamaWriter:
    """A bio writer over Ollama's native ``POST /api/chat``."""

    calls = 0

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0))

    def write(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> str:
        OllamaWriter.calls += 1
        body = {
            "model": model,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }
        try:
            r = self.client.post(f"{self.base_url}/api/chat", json=body)
            r.raise_for_status()
            return r.json()["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
            raise BioError(f"Ollama failed: {e}") from e


def landscape(data: bytes) -> bytes:
    """Cropped and scaled to 1152x896, the shape template v2 renders."""
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    crop_h = round(w * 896 / 1152)
    top = max(0, (h - crop_h) // 2)
    im = im.crop((0, top, w, top + crop_h)).resize((1152, 896), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def preview(png: bytes) -> bytes:
    """Half size, 256 colours: small enough to commit. Hashes in the JSON refer to the originals."""
    im = Image.open(io.BytesIO(png))
    im = im.resize((im.width // 2, im.height // 2), Image.Resampling.LANCZOS)
    im = im.quantize(256, method=Image.Quantize.FASTOCTREE) if im.mode == "RGBA" else im.quantize(256)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def approved(src: Path, dst: Path, by: str, extra: dict | None = None) -> None:
    """Copy a reviewed file, marked approved for the recording (the file itself may still be a draft)."""
    doc = yaml.safe_load(src.read_text())
    doc |= {"status": "approved", "approved_by": by, "approved_at": "2026-11-15", **(extra or {})}
    dst.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True))


def pickers(template: Path) -> dict:
    """What the recording's template adds for the LoRA picker (as argus-mint's api_fixture.py)."""
    doc = yaml.safe_load(template.read_text())
    sdxl = [m for m in doc["models"] if m.startswith("sdxl/")]
    return {
        "lora_options": [
            {"name": "sdxl/sfw/aesthetic/dnd_cover_xl/dnd_cover.safetensors", "weights": [0.8, 0.5], "models": sdxl},
            {"name": "sdxl/sfw/detail/extremely_detailed_xl/extremely_detailed.safetensors", "weights": [0.6],
             "models": sdxl},
            {"name": "flux1-dev/detailed style v1.5.safetensors", "weights": [0.8], "models": [FLUX]},
        ],
        "max_loras": 2,
    }  # fmt: skip


def library(src_fixture: Path, full: Path | None, t: Template, dst: Path) -> tuple[list[LibraryEntry], dict[str, bytes]]:
    """The fixture's library subset as a library argus-mint serves from ``dst``.

    With ``full`` (a built library), entries and images come from it. Without, each entry is
    rebuilt from the listing: the request the approved template makes for it, the attempts the
    old fixture's library draft recorded (or one ok attempt), and the 640 px preview as its image.
    """
    listing = json.loads((src_fixture / "library.json").read_text())
    ids = [i["id"] for i in listing["items"]]
    (dst / "images").mkdir(parents=True)
    if full is not None:
        m = Manifest.model_validate_json((full / MANIFEST).read_text())
        by_id = {e.id: e for e in m.entries}
        entries = [by_id[i] for i in ids]
        for e in entries:
            shutil.copy(full / e.file, dst / e.file)
        manifest = m.model_copy(update={"entries": entries, "count": listing["count"], "failed": []})
    else:
        old = {}
        for item in json.loads((src_fixture / "drafts.json").read_text())["items"]:
            d = json.loads((src_fixture / "drafts" / f"{item['id']}.json").read_text())["draft"]
            if d.get("library"):
                old[d["library"]] = d
        entries = []
        for item in listing["items"]:
            data = (src_fixture / "library" / f"{item['id']}.jpg").read_bytes()
            file = f"images/{item['id']}.jpg"
            (dst / file).write_bytes(data)
            prev = old.get(item["id"])
            req = (
                RenderRequest.model_validate(prev["request"]) if prev
                else fill(t, item["variables"], item["seed"], item["model"])
            )  # fmt: skip
            attempts = tuple(prev["attempts"]) if prev else ({"seed": req.seed, "outcome": "ok", "ref": "", "detail": ""},)
            entries.append(
                LibraryEntry(
                    id=item["id"], group=item["group"], model=item["model"], variables=item["variables"],
                    seed=item["seed"], request=req, attempts=attempts, file=file,
                    sha256=hashlib.sha256(data).hexdigest(),
                )  # fmt: skip
            )
        manifest = Manifest(
            template=listing["template"]["id"], template_version=listing["template"]["version"],
            models=listing["models"], count=listing["count"], seed=8453,
            created_at=datetime(2026, 11, 9, tzinfo=UTC), entries=entries,
        )  # fmt: skip
    (dst / MANIFEST).write_text(manifest.model_dump_json(indent=1) + "\n")
    return manifest.entries, {e.id: (dst / e.file).read_bytes() for e in manifest.entries}


def plan(real: bool) -> str:
    renders = len(CARDS) + SAMPLE["count"]
    bios = renders + 1
    return (
        f"{'GPU' if real else 'stand-in'} work: {renders} renders (template v2's SDXL default checkpoint, "
        f"1152x896, 25 steps, plus a retry if darkroom's image check refuses one), {bios} bios on "
        f"{yaml.safe_load((HERE / 'demo-bio-v1.yaml').read_text())['model']} (each rewritten until it fits; "
        f"at most 8 tries), and darkroom's text check on every try."
    )


def reachable(darkroom: str, ollama: str, model: str) -> None:
    """Stop before any work unless darkroom answers and Ollama has the bio model (neither call uses the GPU)."""
    try:
        httpx.get(f"{darkroom.rstrip('/')}/health", timeout=10).raise_for_status()
        tags = httpx.get(f"{ollama.rstrip('/')}/api/tags", timeout=10).json()
    except (httpx.HTTPError, ValueError) as e:
        sys.exit(f"the GPU host isn't ready: {e}")
    if model not in {m.get("name") for m in tags.get("models", [])}:
        sys.exit(f"Ollama doesn't have {model} (ollama pull {model})")


def main(a: argparse.Namespace) -> None:
    mint = Path(sys.modules["argus_mint"].__file__).resolve().parents[2]
    src_fixture, out = a.fixture.resolve(), a.out.resolve()
    if a.real and not (a.darkroom and a.ollama):
        sys.exit("--real needs DARKROOM_URL and OLLAMA_URL (or --darkroom and --ollama)")
    if a.real:
        reachable(a.darkroom, a.ollama, yaml.safe_load((HERE / "demo-bio-v1.yaml").read_text())["model"])
    print(plan(a.real), file=sys.stderr)
    by = "maintainer" if a.real else "fixture"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for d in ("templates", "frames", "bios"):
            (work / d).mkdir()
        src = mint / "templates" / "example-portrait-v2.yaml"
        approved(src, work / "templates" / "t.yaml", by, pickers(src))
        t = Template.model_validate(yaml.safe_load((work / "templates" / "t.yaml").read_text()))
        nxt = yaml.safe_load(src.read_text())
        nxt |= {"version": t.version + 1, "status": "draft", "negative": nxt["negative"] + ", blurry"}
        (work / "templates" / "t-next.yaml").write_text(yaml.safe_dump(nxt, sort_keys=False))
        approved(mint / "frames" / "card-green-v1.yaml", work / "frames" / "card-green-v1.yaml", by)
        shutil.copy(mint / "frames" / "card-green-v1.png", work / "frames")
        shutil.copy(mint / "frames" / "example-plain-v1.yaml", work / "frames")
        shutil.copy(mint / "frames" / "example-plain-v1.png", work / "frames")
        shutil.copytree(mint / "frames" / "fonts", work / "frames" / "fonts")
        approved(HERE / "demo-bio-v1.yaml", work / "bios" / "demo-bio-v1.yaml", by)
        entries, images = library(src_fixture, a.library, t, work / "library")
        default = t.model if t.model in {e.model for e in entries} else entries[0].model

        if a.real:
            darkroom, writer = DarkroomClient(a.darkroom), OllamaWriter(a.ollama)
        else:
            darkroom = StandInDarkroom([landscape(images[e.id]) for e in entries if e.model == default])
            writer = StandInWriter()
        guard = FitGuard(darkroom, work / "frames" / "card-green-v1.yaml")

        class Backend:  # renders go to darkroom; argus-mint's text check goes through the fit guard
            def generate(self, req):
                return darkroom.generate(req)

            def check_text(self, text):
                return guard.check_text(text)

            def __getattr__(self, attr):  # anything else argus-mint asks of darkroom
                return getattr(darkroom, attr)

        cfg = Settings(
            drafts_dir=work / "drafts", samples_dir=work / "samples", library_dir=work / "library",
            templates_dir=work / "templates", frames_dir=work / "frames", bios_dir=work / "bios",
            darkroom_url="http://darkroom:8106", writer_url="http://writer:9150", ipfs_api="http://kubo:5001",
            network="base-sepolia", card=CARD, moderator_token=TOKEN, siwe_domain="localhost:3108",
        )  # fmt: skip
        app = create_app(
            cfg, darkroom=Backend(), writer=writer, pinner=LocalPinner(), signer=SIGNER, probe_fn=lambda u: True
        )
        c = TestClient(app)
        started = time.monotonic()

        def post(path: str, body: dict, auth: bool = True) -> dict:
            r = c.post(path, headers=AUTH if auth else {}, json=body)
            if r.status_code >= 400:
                sys.exit(f"{path}: {r.status_code} {r.text}")
            return r.json()

        for i, (name, values, texts, fate) in enumerate(CARDS):
            guard.name = name
            print(f"draft {name} ({fate})", file=sys.stderr)
            draft_id = post(
                "/drafts",
                {
                    "template": {"id": t.id, "version": t.version}, "variables": values, "seed": 8453 + i,
                    "asset": f"fixture-{i + 1}", "to": OWNER.address, "name": name,
                    "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID, "texts": texts,
                },
            )["id"]  # fmt: skip
            if fate == "pending":
                continue
            approve = fate != "rejected"
            note = "" if approve else "The halo reads as a second face at card size."
            post(f"/drafts/{draft_id}/review", {"role": "moderator", "approve": approve, "by": "moderator-1", "note": note})
            if fate == "rejected":
                continue
            ch = post(f"/drafts/{draft_id}/challenge", {"approve": True}, auth=False)
            sig = OWNER.sign_message(encode_defunct(text=ch["message"])).signature.hex()
            post(f"/drafts/{draft_id}/review", {"role": "owner", "approve": True, "message": ch["message"], "signature": sig}, auth=False)
            if fate == "published":
                post(f"/drafts/{draft_id}/publish", {"deadline": 1900000000})

        # A card from the library, on another checkpoint: no render; its variables and seed come with it.
        pick = next((e for e in reversed(entries) if e.model != default), entries[-1])
        guard.name = LIBRARY_NAME
        print(f"draft {LIBRARY_NAME} (library {pick.id}, pending)", file=sys.stderr)
        post(
            "/drafts",
            {
                "template": {"id": t.id, "version": t.version}, "library": pick.id, "asset": "fixture-library",
                "to": OWNER.address, "name": LIBRARY_NAME, "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID,
                "texts": {"class": f"{pick.variables['role'].title()} · {pick.variables['colour'].title()}", "stats": "No. 5"},
            },
        )  # fmt: skip

        guard.name = SAMPLE["name"]
        print(f"sample job: {SAMPLE['count']} cards of template v{t.version + 1}", file=sys.stderr)
        job_id = post(
            "/samples",
            {"template": {"id": t.id, "version": t.version + 1}, "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID, **SAMPLE},
        )["id"]  # fmt: skip
        deadline = time.monotonic() + (1800 if a.real else 30)
        while (job := c.get(f"/samples/{job_id}").json())["status"] not in ("done", "failed"):
            if time.monotonic() > deadline:
                sys.exit(f"sample job {job_id} didn't finish")
            time.sleep(0.05 if not a.real else 2)
        for item in job["items"]:
            if item.get("error") or item.get("bio_error"):
                sys.exit(f"sample item {item['n']}: {item.get('error') or item.get('bio_error')}")

        stage = Path(tempfile.mkdtemp(dir=out.parent, prefix=f".{out.name}-"))
        (stage / "drafts").mkdir()

        def dump(rel: str, path: str) -> object:
            data = c.get(path).json()
            (stage / rel).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            return data

        dump("health.json", "/health")
        dump("templates.json", "/templates")
        frames = dump("frames.json", "/frames")
        dump("bios.json", "/bios")
        listing = dump("drafts.json", "/drafts")
        for item in listing["items"]:  # type: ignore[index]
            dump(f"drafts/{item['id']}.json", f"/drafts/{item['id']}")
            (stage / "drafts" / item["id"]).mkdir()
            for which in ("image", "art"):
                png = preview(c.get(f"/drafts/{item['id']}/{which}").content)
                (stage / "drafts" / item["id"] / f"{which}.png").write_bytes(png)
            d = c.get(f"/drafts/{item['id']}").json()["draft"]
            if d["frame"]:  # where the card's text sits, for the style editor's preview
                texts = {"name": d["name"], **({"bio": d["bio"]["text"]} if d["bio"] else {}), **d["texts"]}
                lay = c.post(f"/frames/{d['frame']['id']}/{d['frame']['version']}/layout", json={"texts": texts})
                (stage / "drafts" / item["id"] / "layout.json").write_text(json.dumps(lay.json(), indent=1) + "\n")
        jobs = dump("samples.json", "/samples")
        (stage / "samples").mkdir()
        for job in jobs["items"]:  # type: ignore[index]
            dump(f"samples/{job['id']}.json", f"/samples/{job['id']}")
            (stage / "samples" / job["id"]).mkdir()
            for item in job["items"]:
                for which in ("art", "framed"):
                    if item[which]:
                        png = preview(c.get(f"/samples/{job['id']}/{item['n']}/{which}").content)
                        (stage / "samples" / job["id"] / f"{item['n']}-{which}.png").write_bytes(png)
        dump("library.json", "/library")
        (stage / "library").mkdir()
        for e in entries:
            if a.library is None:  # the previews are the images: keep their bytes
                (stage / "library" / f"{e.id}.jpg").write_bytes(images[e.id])
            else:
                thumb = c.get(f"/library/{e.id}/image", params={"thumb": THUMB})
                thumb.raise_for_status()
                (stage / "library" / f"{e.id}.jpg").write_bytes(thumb.content)
        for f in frames:  # type: ignore[union-attr]
            fid, ver = f["frame"]["id"], f["frame"]["version"]
            (stage / "frames" / fid / str(ver)).mkdir(parents=True)
            (stage / "frames" / fid / str(ver) / "overlay.png").write_bytes(c.get(f"/frames/{fid}/{ver}/overlay").content)
            for font in sorted({s["font"] for s in f["frame"]["texts"].values() if s.get("font")}):
                dest = stage / "frames" / fid / str(ver) / "fonts" / font
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(c.get(f"/frames/{fid}/{ver}/fonts/{font}").content)
        kind = "recorded" if a.real else "sample"
        note = (
            "Recorded from argus-mint with real backends: renders and text checks by argus-darkroom, bios by "
            "Ollama. Pins are local (non-IPFS) CIDs; the voucher is signed with a public test key for Base "
            "Sepolia's demo Card contract. Nothing was pinned or minted."
            if a.real
            else "argus-mint's real server with stand-in backends: art from the portrait library, hand-written bios, "
            "local (non-IPFS) CIDs, a public test-key owner and Base Sepolia's chain id. Nothing was pinned or minted."
        )
        provenance = {"kind": kind, "source": "argus-assay scripts/record_demo.py", "note": note}
        (stage / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
        (stage / "README.md").write_text(README.format(kind=kind, note=note))
        if out.exists():
            shutil.rmtree(out)
        stage.rename(out)
    calls = OllamaWriter.calls if a.real else StandInWriter.calls
    print(
        f"{out}: {kind}, {len(listing['items'])} drafts, 1 sample job; {calls} bio(s) written, "
        f"{guard.checked} checked, {len(guard.taken)} kept; {time.monotonic() - started:.0f} s",
        file=sys.stderr,
    )


README = """# The demo's fixture ({kind})

Recorded responses of argus-mint's real server, `argus-mint serve`, for argus-assay's static demo
(`make pages`) and demo mode (`make mock`). Made by `scripts/record_demo.py`; see
docs/demo-recording.md.

{note}

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
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--real", action="store_true", help="render and write on the GPU host (default: stand-ins)")
    ap.add_argument("--darkroom", default=os.environ.get("DARKROOM_URL", ""), help="argus-darkroom (default $DARKROOM_URL)")
    ap.add_argument("--ollama", default=os.environ.get("OLLAMA_URL", ""), help="Ollama (default $OLLAMA_URL)")
    ap.add_argument("--fixture", type=Path, default=ROOT / "fixture", help="the fixture whose library to keep")
    ap.add_argument("--library", type=Path, help="a built argus-mint library with the full images")
    ap.add_argument("--out", type=Path, default=ROOT / "fixture", help="where to write (default fixture/)")
    main(ap.parse_args())
