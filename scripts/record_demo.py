"""Record the hosted demo's fixture: argus-mint's real server, walked through every review state.

    uv run --project $MINT python scripts/record_demo.py [--real] [--out fixture] [--library DIR]
        [--cache DIR [--no-render] [--rewrite-bio NAME ...]] [--seed "Card Name=SEED" ...] [--reject-notes DIR]

MINT is an argus-mint checkout (its own environment: `uv sync --all-extras` there). The run is a
copy of argus-mint's scripts/api_fixture.py with changes for the demo: the drafts render from
scripts/demo-portrait-v1.yaml, the bio template is scripts/demo-bio-v1.yaml, and every bio must
pass scripts/bio_fit.json (fill the card's bio box; vary its opening; use its card's pronouns;
share no run of 6 words, opening or simile with another card's). A bio that misses is rejected
and argus-mint asks the writer again, so the draft records each attempt.

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

TEMPLATE = {"id": "demo-portrait", "version": 1}  # scripts/demo-portrait-v1.yaml; the library stays on example-portrait v2
WIZARD, CYBORG = "wizard in long flowing robes", "cyborg whose arms and shoulders are chrome steel plating with visible mechanical joints"
PRIEST = "priest of an invented order of lantern-bearers, holding a glowing brass lantern"
CAST = {"id": "demo-cast", "version": 1}  # scripts/demo-cast-v1.yaml: the wider cast, so the first four keep their renders
CARDS = [  # name, template, variables, seed, display text, what happens to it
    ("Emerald Wizard", TEMPLATE, {"gender": "female", "role": WIZARD, "colour": "emerald green", "pose": "casting a spell",
                                  "background": "library"}, 8461, {"class": "Wizard · Emerald", "stats": "No. 1"}, "published"),
    ("Steel Tinker", TEMPLATE, {"gender": "non-binary", "role": CYBORG, "colour": "steel grey", "pose": "repairing a brass mechanism",
                                "background": "workshop"}, 8472, {"class": "Cyborg · Steel", "stats": "No. 2"}, "pending"),
    ("Azure Stormcaller", TEMPLATE, {"gender": "female", "role": WIZARD, "colour": "azure blue", "pose": "casting a spell",
                                     "background": "temple"}, 8473, {"class": "Wizard · Azure", "stats": "No. 3"}, "approved"),
    ("Lantern Keeper", TEMPLATE, {"gender": "female", "role": PRIEST, "colour": "gold", "pose": "praying",
                                  "background": "temple"}, 8464, {"class": "Priest · Gold", "stats": "No. 4"}, "rejected"),
]  # fmt: skip
ROLE = {r.split(",")[0].split(" in ")[0]: r for r in yaml.safe_load((HERE / "demo-cast-v1.yaml").read_text())["variables"]["role"]}
CAST_CARDS = [  # name, role (its first words), gender, age, build, colour, pose, background, class, fate
    ("Crimson Smith", "blacksmith", "male", "middle-aged with lines around the eyes", "heavyset", "crimson red", "forging", "workshop", "Smith · Crimson", "rejected"),
    ("Brass Butler", "clockwork automaton", "non-binary", "ageless", "compact", "copper", "pouring tea", "kitchen", "Automaton · Copper", "published"),
    ("Violet Stargazer", "astronomer", "female", "elderly with white hair and a wrinkled face", "slender", "violet purple", "stargazing", "observatory", "Astronomer · Violet", "published"),
    ("Teapot Oracle", "animated porcelain teapot with a friendly painted face", "non-binary", "ageless", "compact", "ivory white", "pouring tea", "market", "Object · Ivory", "published"),
    ("Amber Pilot", "starship pilot", "non-binary", "in their thirties with clearly adult features", "wiry", "amber orange", "piloting", "starship bridge", "Pilot · Amber", "approved"),
    ("Owl Scholar", "owlfolk", "male", "grey-haired and lined in their sixties", "stocky", "obsidian black", "charting a map", "library", "Owlfolk · Obsidian", "rejected"),
    ("Harbour Bard", "bard", "male", "in their thirties with clearly adult features", "tall and lanky", "rose pink", "playing a lute", "harbour", "Bard · Rose", "approved"),
    ("Salvage Walker", "salvage robot", "non-binary", "ageless", "broad-shouldered", "steel grey", "repairing a brass mechanism", "market", "Robot · Steel", "approved"),
    ("Copper Alchemist", "alchemist", "female", "elderly with white hair and a wrinkled face", "heavyset", "copper", "brewing a potion", "alchemy lab", "Alchemist · Copper", "published"),
    ("Ember Salamander", "salamander", "non-binary", "ageless", "compact", "crimson red", "guarding a hoard", "mountain cave", "Creature · Crimson", "approved"),
    ("Sky Captain", "sky-pirate captain", "male", "grey-haired and lined in their sixties", "broad-shouldered", "teal", "charting a map", "airship deck", "Captain · Teal", "rejected"),
    ("Spellbook Familiar", "living spellbook with two round eyes on its leather cover", "non-binary", "ageless", "compact", "violet purple", "floating above a desk", "library", "Object · Violet", "rejected"),
    ("Fern Botanist", "botanist", "non-binary", "elderly with white hair and a wrinkled face", "stocky", "moss green", "gardening", "greenhouse", "Botanist · Moss", "pending"),
    ("Ivory Medic", "starship medic", "male", "in their thirties with clearly adult features", "broad-shouldered", "ivory white", "standing", "space station", "Medic · Ivory", "pending"),
    ("Gate Warden", "city guard", "female", "elderly with white hair and a wrinkled face", "heavyset", "steel grey", "keeping watch", "market", "Guard · Steel", "pending"),
]  # fmt: skip
# Each card's render seed: 8501 up in list order, except the re-rolls picked by eye (and Gate Warden, which kept
# its seed when a card before it was dropped).
CAST_SEED = {"Gate Warden": 8516, "Copper Alchemist": 8574, "Crimson Smith": 8522, "Teapot Oracle": 8532, "Owl Scholar": 8542, "Ivory Medic": 8591}
for n, (name, role, gender, age, build, colour, pose, background, klass, fate) in enumerate(CAST_CARDS):
    CARDS.append((name, CAST, {"role": ROLE[role], "gender": gender, "age": age, "build": build, "colour": colour, "pose": pose,
                               "background": background}, CAST_SEED.get(name, 8501 + n), {"class": klass, "stats": f"No. {n + 6}"}, fate))  # fmt: skip
UNTIL = ""  # --until HH:MM (UTC): start no GPU work at or after it
BIO_ROUNDS = 3  # rounds of the bio template's max_attempts per draft
SEEDS: dict[str, int] = {}  # per-card seed overrides, from --seed NAME=SEED (a re-roll)
LIBRARY_NAME = "Library Pick"
# Seed 120 over the non-binary combinations of demo-portrait v2 picks a giant and a dragon.
SAMPLE = {"count": 2, "seed": 120, "variables": {"gender": "non-binary"}, "name": "Sample",
          "texts": {"class": "Sample class", "stats": "No. 0"}}  # fmt: skip
DEFAULT_REJECT_NOTE = "The figure sits too far left of the art window at card size."

# The stand-in writer's bios, one per card: (words the prompt must hold, the bio). Hand-written for
# the sample fixture; each passes the same checks a model's bio must.
BIOS = [
    (("wizard", "emerald", "library"),
     "{name} reshelves the library by spell, and the books, flattered, line up by colour. Her emerald "
     "sleeves are stuffed with bookmarks. She has never once been shushed, though she keeps trying."),
    (("cyborg", "workshop"),
     "{name} oils every hinge in the workshop before breakfast, their own knees included. Steel fingers "
     "hum as they solder, and the kettle, rebuilt twice, now whistles in three keys."),
    (("wizard", "azure", "temple"),
     "Drizzle for gardens, snow for birthdays: {name} calls down weather on request. In the temple her "
     "azure robes crackle faintly, and the bell ringers give her a wide, polite berth."),
    (("priest", "gold"),
     "{name} prays in a whisper so the temple mice can sleep. Her gold vestments catch the dawn and "
     "pass it on to whoever needs it most. Candles lean her way whenever she walks by."),
    (("knight", "gold", "academy"),
     "At the academy gate stands {name}, polishing gold armour between lessons. Every winter the "
     "students borrow the shield as a sled. The knight pretends not to notice, and waxes it."),
    (("stone giant", "temple"),
     "No ladder needed: {name} reads the temple's tallest books where they stand, turning pages with two "
     "careful fingers. Moss in that beard hosts a family of wrens, who chirp when a chapter ends."),
    (('blacksmith',),
     'Sparks hiss as {name} folds crimson steel at the workshop forge, humming an old marching tune. He shapes horseshoes for snails, just in case. Nobody has yet seen a snail wear one.'),
    (('clockwork automaton',),
     'Tea arrives before anyone asks: {name} hears kettles think. Their copper joints click politely in the kitchen, and every biscuit is set out at a precise angle. Crumbs are swept up with tiny brushes.'),
    (('astronomer',),
     'Every clear night {name} counts the stars twice, in case one has slipped away. Her violet shawl is sewn with constellations she has named after her cats. The observatory cats approve.'),
    (('teapot',),
     'Steam curls into tidy question marks whenever {name} pours at the market stall. Customers sip, then read their futures in the leaves. The predictions are always kind, and usually about cake.'),
    (('starship pilot',),
     'Three moons blur past while {name} steers the amber shuttle with one knee and hums. They keep a paper map in the glovebox, just for comfort. Autopilot sulks whenever it is switched on.'),
    (('owlfolk',),
     'Quills fly from his own feathers as {name} charts the coastline by lamplight. He blinks slowly at every mistake until it corrects itself. The library mice bring him fresh ink at dusk.'),
    (('bard',),
     'Gulls request encores whenever {name} tunes his lute on the harbour wall. His rose-pink coat is patched with ticket stubs from every port. Fishermen swear the tide waits for the chorus.'),
    (('salvage robot',),
     "Bolts, springs and one lonely bell: {name} sorts the market's scrap with six patient legs. Its camera eye whirs at anything shiny. Traders leave spare washers out as tips for the robot."),
    (('alchemist',),
     'Bubbles of copper foam spill over as {name} stirs a potion meant to cure hiccups. She tests every batch on herself first. So far she has hiccuped in four languages.'),
    (('salamander',),
     'Warm coins clink under {name}, who guards a hoard of lost buttons in the mountain cave. Visitors may borrow one if they ask nicely. The cave stays toasty all winter long.'),
    (('sky-pirate',),
     'Clouds part for the airship as {name} charts a route around a sleepy thunderhead. He pays his crew in maps and marmalade. Nobody has ever asked for gold instead.'),
    (('spellbook',),
     'Pages rustle awake whenever {name} drifts above the library desk at midnight. Its round eyes follow readers who skip ahead. Footnotes appear, scolding them gently, then vanish again.'),
    (('botanist',),
     'Seedlings lean toward {name}, who whispers their Latin names in the greenhouse each morning. They water ferns with cold tea and praise. The tomatoes have started blushing on cue.'),
    (('starship medic',),
     'Bandages, biscuits and bad jokes: {name} treats the space station crew with all three. His ivory coat has pockets for every emergency. One pocket holds only a rubber duck.'),
    (('city guard',),
     'Lanterns lit, gates checked, {name} keeps watch over the market with a flask of cocoa. She knows every cat by name and rank. Pickpockets give her stall a respectful wide berth.'),
    (("dragon", "silver", "hoard"),
     "Spoons, thimbles, one lost kettle: {name} guards a silver hoard in the garden and polishes it "
     "nightly. The roses grow in a ring around the pile. Neighbours borrow ladles back."),
]  # fmt: skip


SIMILE = {"like", "as"}


def stem(w: str) -> str:
    """A crude stem, so "dance like sparks" and "dancing like sparks" count as one simile."""
    if w in SIMILE:
        return w
    for suffix in ("ing", "es", "ed", "s", "e"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[: -len(suffix)]
    return w


def shared_simile(a: str, b: str) -> str | None:
    """A 3-word run around "like" or "as" that ``a`` and ``b`` share (stemmed), or None."""
    wa, wb = [stem(w) for w in words(a)], [stem(w) for w in words(b)]
    grams = {tuple(wb[i : i + 3]) for i in range(len(wb) - 2) if SIMILE & set(wb[i : i + 3])}
    for i in range(len(wa) - 2):
        g = tuple(wa[i : i + 3])
        if SIMILE & set(g) and g in grams:
            return " ".join(words(a)[i : i + 3])
    return None


ARTICLES = {"a", "an", "the"}
PRONOUNS = {  # a bio uses only its card's gender's pronouns ("their" is left out: it is also plural)
    "female": {"she", "her", "hers", "herself"},
    "male": {"he", "him", "his", "himself"},
    "non-binary": {"they", "them", "themself", "themselves"},
}


def wrong_pronoun(text: str, gender: str) -> str | None:
    """A pronoun of another gender than ``gender`` in ``text``, or None."""
    if gender not in PRONOUNS:
        return None
    others = set().union(*(v for k, v in PRONOUNS.items() if k != gender))
    return next((w for w in words(text) if w in others), None)


def simile_heads(text: str) -> set[str]:
    """What each "like" compares to: the next word that isn't an article, stemmed ("like moonlit snow": "moonlit")."""
    ws = words(text)
    heads = set()
    for i, w in enumerate(ws):
        if w == "like":
            rest = [x for x in ws[i + 1 : i + 3] if x not in ARTICLES]
            if rest:
                heads.add(stem(rest[0]))
    return heads


def last_sentence(text: str) -> str:
    """The text's last sentence."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text.strip()) if p.strip()]
    return parts[-1] if parts else ""


def opening(text: str) -> list[str]:
    """The first two words, with the name as a word of its own."""
    return re.findall(r"\{name\}|[a-z0-9']+", text.lower())[:2]


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
        self.name, self.gender = "", ""
        self.on_keep = lambda text: None  # told of each bio that passed (the bio cache keeps it)
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
        first = opening(text)
        if first and first[0] in FIT["banned_openings"]:
            return f'opens with "{first[0]}"; vary the opening'
        mark = next((m for m in FIT["banned_marks"] if m in text), None)
        if mark:
            return f'uses "{mark}"; write whole sentences'
        if text.count("{name}") != 1:
            return f"names the card {text.count('{name}')} times; it wants the name once"
        if text.count('"') % 2 or text.count("\u201c") != text.count("\u201d"):
            return "leaves a quotation open"
        banned = next((w for w in words(text) if any(w.startswith(stem(b)) for b in FIT["banned_words"])), None)
        if banned:
            return f'uses the stock word "{banned}"'
        if len(words(last_sentence(text))) < FIT["last_sentence_words"]:
            return f'ends on a fragment ("{last_sentence(text)}")'
        pronoun = wrong_pronoun(text, self.gender)
        if pronoun:
            return f'says "{pronoun}" of a {self.gender} character'
        if words(text).count("like") > FIT["max_similes"]:
            return f"has more than {FIT['max_similes']} simile with \"like\""
        if first[:1] == ["{name}"] and sum(opening(prev)[:1] == ["{name}"] for _, prev in self.taken) >= FIT["name_openings"]:
            return f"opens with the name, as {FIT['name_openings']} other bios already do; open with a deed, an object or a sound"
        for other, prev in self.taken:
            run = shared_run(text, prev, FIT["shared_words"])
            if run:
                return f'repeats "{run}" from {other}\'s bio'
            if opening(prev) == first:
                return f'opens like {other}\'s bio ("{" ".join(first)}")'
            simile = shared_simile(text, prev)
            if simile:
                return f'reuses the simile "{simile}" from {other}\'s bio'
            head = simile_heads(text) & simile_heads(prev)
            if head:
                return f'compares to "{head.pop()}…" as {other}\'s bio does'
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
            self.on_keep(text)
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


class CachedWriter:
    """A writer that first offers the bio a card kept last run (``--cache``: DIR/bios.json, by card name and
    prompt), then asks ``inner``. An offered bio is checked again like any other, so a rerun keeps the bios
    that still pass and writes only the rest. Cards in ``fresh`` (``--rewrite-bio``) are written afresh."""

    def __init__(self, inner, path: Path | None, guard: FitGuard, fresh: set[str]):
        self.inner, self.path, self.guard, self.fresh = inner, path, guard, fresh
        self.kept = json.loads(path.read_text()) if path and path.is_file() else {}
        self.offered: set[str] = set()
        self.key = ""
        guard.on_keep = self.keep

    def write(self, *, prompt: str, **kw) -> str:
        self.key = f"{self.guard.name}|{hashlib.sha256(prompt.encode()).hexdigest()[:16]}"
        if self.key in self.kept and self.key not in self.offered and self.guard.name not in self.fresh:
            self.offered.add(self.key)
            print(f"  bio for {self.guard.name} from the cache", file=sys.stderr)
            return self.kept[self.key]
        return self.inner.write(prompt=prompt, **kw)

    def keep(self, text: str) -> None:
        if self.path and self.key:
            self.kept[self.key] = text
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.kept, indent=1, ensure_ascii=False))

    def __getattr__(self, attr):
        return getattr(self.inner, attr)


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
    """A bio writer over Ollama's native ``POST /api/chat``. ``unload`` frees the model's VRAM."""

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

    def unload(self, model: str) -> None:
        """Ask Ollama to drop ``model`` now (keep_alive 0), so the GPU is free when the run ends."""
        try:
            self.client.post(f"{self.base_url}/api/chat", json={"model": model, "messages": [], "keep_alive": 0})
        except httpx.HTTPError as e:
            print(f"couldn't unload {model}: {e}", file=sys.stderr)


GATE = {"darkroom": ""}  # darkroom's URL in a real run: the gate waits for it to be idle
OOM = ("out of memory", "would exceed allowed memory")


def gpu_window(real: bool) -> None:
    """Start no GPU work from :50 to :05 (a scheduled job has the GPU then, and needs a few minutes to
    release it), nor while darkroom is busy with someone else's job."""
    if not real:
        return
    while True:
        now = datetime.now(UTC)
        if UNTIL and f"{now:%H:%M}" >= UNTIL:
            sys.exit(f"{now:%H:%M} UTC: past --until {UNTIL}; stopping before more GPU work (rerun with the same --cache to resume)")
        if now.minute >= 50 or now.minute < 5:
            wait = ((65 - now.minute) % 60) * 60 - now.second
            print(f"{now:%H:%M} UTC: pausing {wait} s for the scheduled :50-:05 GPU job", file=sys.stderr)
            time.sleep(wait)
            continue
        try:
            busy = httpx.get(f"{GATE['darkroom'].rstrip('/')}/health", timeout=10).json().get("generating", False)
        except (httpx.HTTPError, ValueError):
            busy = True
        if not busy:
            return
        print(f"{now:%H:%M} UTC: darkroom is generating; waiting 30 s", file=sys.stderr)
        time.sleep(30)


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


def reject_note(c: TestClient, draft_id: str, name: str, notes: Path | None) -> str:
    """The moderator's note on a rejected card. With ``notes``, the card is written to NOTES/<card>.png and
    the run waits for a person to write NOTES/<card>.txt, so the note says what is true of this render.
    A note already there is kept while the render (the unframed art) is the same one it was written for."""
    if notes is None:
        return DEFAULT_REJECT_NOTE
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    txt, png, sha = notes / f"{slug}.txt", notes / f"{slug}.png", notes / f"{slug}.art-sha256"
    art = hashlib.sha256(c.get(f"/drafts/{draft_id}/art").content).hexdigest()
    if txt.is_file() and txt.read_text().strip() and sha.is_file() and sha.read_text().strip() == art:
        print(f"  {name}: the moderator's note for this render is in {txt}", file=sys.stderr)
        return txt.read_text().strip()
    notes.mkdir(parents=True, exist_ok=True)
    txt.unlink(missing_ok=True)
    sha.write_text(art)
    png.write_bytes(c.get(f"/drafts/{draft_id}/image").content)
    print(f"  waiting for the moderator's note on {name} in {txt} (the card is {png})", file=sys.stderr)
    while not txt.is_file() or not txt.read_text().strip():
        time.sleep(3)
    return txt.read_text().strip()


def plan(real: bool) -> str:
    renders = len(CARDS) + SAMPLE["count"]
    bios = renders + 1
    return (
        f"{'GPU' if real else 'stand-in'} work: {renders} renders (demo-portrait and demo-cast, one SDXL "
        f"checkpoint, 1152x896, 25 steps, plus a retry if darkroom's image check refuses one; with --cache, "
        f"only those not made before), {bios} bios on "
        f"{yaml.safe_load((HERE / 'demo-bio-v1.yaml').read_text())['model']} (each rewritten until it fits; "
        f"16 tries a round, {BIO_ROUNDS} rounds for a draft), and darkroom's text check on every try."
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
        demo_src = HERE / "demo-portrait-v1.yaml"
        approved(demo_src, work / "templates" / "demo.yaml", by)
        approved(HERE / "demo-cast-v1.yaml", work / "templates" / "cast.yaml", by)
        # awaiting catalogue review: the demo template one version up, with one more negative term
        nxt = yaml.safe_load(demo_src.read_text())
        nxt |= {"version": TEMPLATE["version"] + 1, "status": "draft", "negative": nxt["negative"] + ", blurry"}
        (work / "templates" / "demo-next.yaml").write_text(yaml.safe_dump(nxt, sort_keys=False))
        approved(mint / "frames" / "card-green-v1.yaml", work / "frames" / "card-green-v1.yaml", by)
        shutil.copy(mint / "frames" / "card-green-v1.png", work / "frames")
        shutil.copy(mint / "frames" / "example-plain-v1.yaml", work / "frames")
        shutil.copy(mint / "frames" / "example-plain-v1.png", work / "frames")
        shutil.copytree(mint / "frames" / "fonts", work / "frames" / "fonts")
        approved(HERE / "demo-bio-v1.yaml", work / "bios" / "demo-bio-v1.yaml", by)
        entries, images = library(src_fixture, a.library, t, work / "library")
        default = t.model if t.model in {e.model for e in entries} else entries[0].model

        if a.real:
            GATE["darkroom"] = a.darkroom
            darkroom, writer = DarkroomClient(a.darkroom), OllamaWriter(a.ollama)
        else:
            darkroom = StandInDarkroom([landscape(images[e.id]) for e in entries if e.model == default])
            writer = StandInWriter()
        guard = FitGuard(darkroom, work / "frames" / "card-green-v1.yaml")
        writer = CachedWriter(writer, a.cache / "bios.json" if a.cache and a.real else None, guard, set(a.rewrite_bio))

        refused: list[str] = []  # darkroom records of renders its image check refused (to purge one by one)
        missing: list[str] = []  # --no-render: renders the cache didn't have

        class Backend:  # renders go to darkroom; argus-mint's text check goes through the fit guard
            def generate(self, req):
                # --cache: a render already made for this exact request is reused (same record and outcome,
                # a refusal included), so a re-roll of one card renders that card alone.
                key = hashlib.sha256(json.dumps(req.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:24]
                hit = a.cache / f"{key}.json" if a.cache and a.real else None
                if hit and hit.is_file():
                    meta = json.loads(hit.read_text())
                    print(f"  render from the cache ({meta['ref']}, {meta.get('outcome', 'ok')})", file=sys.stderr)
                    if meta.get("outcome") == "safety_rejected":
                        return GenResult.safety_rejected(meta["detail"], ref=meta["ref"])
                    return GenResult.ok(hit.with_suffix(".png").read_bytes(), ref=meta["ref"], workflow=meta["workflow"])
                if a.no_render:  # bios only: a render not in the cache stops the run (after the bios that need none)
                    missing.append(f"seed {req.seed}: {req.prompt[:80]}")
                    return GenResult.error("--no-render: this render is not in the cache")
                # A ComfyUI out-of-memory error is the GPU's state, not the request's: wait and render it again.
                for n in range(6):
                    gpu_window(a.real)
                    r = darkroom.generate(req)
                    if r.outcome == "safety_rejected" and r.ref:
                        refused.append(r.ref)
                        if hit:
                            hit.parent.mkdir(parents=True, exist_ok=True)
                            hit.write_text(json.dumps({"ref": r.ref, "outcome": r.outcome, "detail": r.detail}))
                    if r.outcome == "ok" and hit:
                        hit.parent.mkdir(parents=True, exist_ok=True)
                        hit.with_suffix(".png").write_bytes(r.image)
                        hit.write_text(json.dumps({"ref": r.ref, "workflow": r.workflow}))
                    if not (a.real and r.outcome == "error" and any(m in r.detail.lower() for m in OOM)) or n == 5:
                        return r
                    print(f"  out of GPU memory; retrying in 60 s ({n + 1}/5)", file=sys.stderr)
                    time.sleep(60)
                return r

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

        for i, (name, tpl, values, seed, texts, fate) in enumerate(CARDS):
            gpu_window(a.real)
            guard.name, guard.gender = name, values["gender"]
            print(f"draft {name} ({fate})", file=sys.stderr)
            body = {
                "template": tpl, "variables": values, "seed": SEEDS.get(name, seed),
                "asset": f"fixture-{i + 1}", "to": OWNER.address, "name": name,
                "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID, "texts": texts,
            }  # fmt: skip
            # A bio that runs out of tries fails the draft; its render is cached by then, so ask again.
            for again in range(BIO_ROUNDS):
                r = c.post("/drafts", headers=AUTH, json=body)
                if not (r.status_code == 422 and "attempts were rejected" in r.text and again < BIO_ROUNDS - 1):
                    break
                print(f"  {name}: every bio try missed; another round ({again + 2}/{BIO_ROUNDS})", file=sys.stderr)
            if r.status_code >= 400:
                sys.exit(f"/drafts: {r.status_code} {r.text}")
            draft_id = r.json()["id"]
            if fate == "pending":
                continue
            approve = fate != "rejected"
            note = "" if approve else reject_note(c, draft_id, name, a.reject_notes)
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
        gpu_window(a.real)
        guard.name, guard.gender = LIBRARY_NAME, pick.variables["gender"]
        print(f"draft {LIBRARY_NAME} (library {pick.id}, pending)", file=sys.stderr)
        post(
            "/drafts",
            {
                "template": {"id": t.id, "version": t.version}, "library": pick.id, "asset": "fixture-library",
                "to": OWNER.address, "name": LIBRARY_NAME, "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID,
                "texts": {"class": f"{pick.variables['role'].title()} · {pick.variables['colour'].title()}", "stats": "No. 5"},
            },
        )  # fmt: skip

        gpu_window(a.real)
        guard.name, guard.gender = SAMPLE["name"], SAMPLE["variables"]["gender"]
        nxt_ref = {"id": TEMPLATE["id"], "version": TEMPLATE["version"] + 1}
        print(f"sample job: {SAMPLE['count']} cards of {nxt_ref['id']} v{nxt_ref['version']}", file=sys.stderr)
        job_id = post(
            "/samples",
            {"template": nxt_ref, "frame": {"id": "card-green", "version": 1}, "bio": BIO_ID, **SAMPLE},
        )["id"]  # fmt: skip
        deadline = time.monotonic() + (5400 if a.real else 30)
        while (job := c.get(f"/samples/{job_id}").json())["status"] not in ("done", "failed"):
            if time.monotonic() > deadline:
                sys.exit(f"sample job {job_id} didn't finish")
            time.sleep(0.05 if not a.real else 2)
        if missing:
            sys.exit("--no-render: not in the cache, so not rendered:\n  " + "\n  ".join(missing))
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
    if refused:
        print(f"darkroom refused {len(refused)} render(s); purge each: {' '.join(refused)}", file=sys.stderr)
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

- At least five drafts in every state, so each of the queue's filters has a page of cards: pending
  (one from the portrait library), approved, rejected (each with the moderator's note on its render),
  published (with its `publish.json` result: pins, metadata, signed voucher). One sample job, of a
  giant and a dragon.
- The first four drafts render from scripts/demo-portrait-v1.yaml, the rest (people, robots,
  creatures and living objects) from scripts/demo-cast-v1.yaml; the library card's template is
  argus-mint's example-portrait v2. All three, the card-green frame and the bio template (scripts/demo-bio-v1.yaml)
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
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--real", action="store_true", help="render and write on the GPU host (default: stand-ins)")
    ap.add_argument("--darkroom", default=os.environ.get("DARKROOM_URL", ""), help="argus-darkroom (default $DARKROOM_URL)")
    ap.add_argument("--ollama", default=os.environ.get("OLLAMA_URL", ""), help="Ollama (default $OLLAMA_URL)")
    ap.add_argument("--fixture", type=Path, default=ROOT / "fixture", help="the fixture whose library to keep")
    ap.add_argument("--library", type=Path, help="a built argus-mint library with the full images")
    ap.add_argument("--out", type=Path, default=ROOT / "fixture", help="where to write (default fixture/)")
    ap.add_argument("--cache", type=Path, help="keep renders here and reuse one made for the same request (re-rolls)")
    ap.add_argument("--no-render", action="store_true", help="with --cache: make no render; stop if one isn't cached")
    ap.add_argument("--until", metavar="HH:MM", help="start no GPU work at or after this UTC time (the run stops; resume with --cache)")
    ap.add_argument("--seed", action="append", default=[], metavar="NAME=SEED", help="re-roll one card with a new seed")
    ap.add_argument("--reject-notes", type=Path, metavar="DIR", help="wait for each rejected card's moderator note in DIR/<card>.txt")
    ap.add_argument("--rewrite-bio", action="append", default=[], metavar="NAME", help="with --cache: write this card's bio afresh")
    args = ap.parse_args()
    UNTIL = args.until or ""
    for kv in args.seed:
        card, _, value = kv.rpartition("=")
        SEEDS[card] = int(value)
    try:
        main(args)
    finally:  # done or failed, the bio model leaves the GPU at once
        if args.real and args.ollama:
            OllamaWriter(args.ollama).unload(yaml.safe_load((HERE / "demo-bio-v1.yaml").read_text())["model"])
