#!/usr/bin/env node
// A stand-in argus-mint for assay's demo mode: serves fixture/ (recorded from `argus-mint serve`
// by argus-mint's scripts/api_fixture.py) on MOCK_PORT, with state in memory so the flow can be
// clicked through without a GPU, darkroom, IPFS or a wallet:
//   reviews change a draft's status, catalogue decisions stick, samples "render" after a delay,
//   creating a draft clones the fixture's pending one, publishing reuses the published result.
// It checks no token and no signature, and composites nothing (a frame preview returns a
// recorded framed image). Its /health says `mock: true`, which offers "Approve as demo owner".
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "fixture");
const port = Number(process.env.MOCK_PORT ?? 8108);
const STEP_MS = Number(process.env.MOCK_STEP_MS ?? 1500);
const read = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const png = (rel) => readFileSync(join(root, rel));

const health = { ...read("health.json"), mock: true };
const templates = read("templates.json");
const frames = read("frames.json");
const bios = read("bios.json");
const drafts = new Map(); // id -> detail
const images = new Map(); // id -> { image, art }
for (const item of read("drafts.json").items) {
  drafts.set(item.id, read(`drafts/${item.id}.json`));
  images.set(item.id, { image: png(`drafts/${item.id}/image.png`), art: png(`drafts/${item.id}/art.png`) });
}
// Recorded layouts (Pillow's, from argus-mint), reused when a slot's text matches exactly.
const recordedLayouts = new Map(); // `${slot}\u0000${text}` -> slot layout
for (const id of drafts.keys()) {
  const f = join(root, "drafts", id, "layout.json");
  if (!existsSync(f)) continue;
  for (const [slot, l] of Object.entries(JSON.parse(readFileSync(f, "utf8")).slots)) {
    recordedLayouts.set(`${slot}\u0000${l.lines.map((x) => x.text).join(" ")}`, l);
  }
}

// Without Pillow, a new text gets an approximate layout: average glyph width ~0.5em.
function approxLayout(box, text) {
  const size = box.size ?? 48;
  const perLine = Math.max(1, Math.floor(box.width / (size * 0.5)));
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (box.wrap && cur && (cur + " " + w).length > perLine) (lines.push(cur), (cur = w));
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const ascent = Math.round(size * 0.8), descent = Math.round(size * 0.25);
  const lineH = Math.round((ascent + descent) * (box.line_spacing ?? 1.15));
  const blockH = lineH * (lines.length - 1) + ascent + descent;
  let y = box.valign === "top" ? box.y : box.y + Math.floor((box.height - blockH) / 2);
  return {
    font: box.font ?? null, size, ascent, descent,
    effects: { shadow: Math.max(1, Math.round(size * 0.06)), outline: Math.max(1, Math.round(size * 0.05)), glow: Math.max(2, Math.round(size * 0.18)) },
    lines: lines.map((t) => {
      const w = t.length * size * 0.5;
      const x = box.align === "left" ? box.x : box.align === "right" ? box.x + box.width - w : box.x + (box.width - w) / 2;
      const out = { text: t, x: Math.round(x), y };
      y += lineH;
      return out;
    }),
  };
}

const samples = new Map();
const sampleImages = new Map(); // `${id}/${n}/${which}` -> bytes
for (const job of read("samples.json").items) {
  samples.set(job.id, read(`samples/${job.id}.json`));
  for (const f of readdirSync(join(root, "samples", job.id))) {
    const [n, which] = f.replace(".png", "").split("-");
    sampleImages.set(`${job.id}/${n}/${which}`, png(`samples/${job.id}/${f}`));
  }
}
const template = [...samples.values()][0];
const published = [...drafts.values()].find((d) => d.published)?.published;
const pendingId = [...drafts.values()].find((d) => d.status === "pending")?.id;
const id16 = () => randomBytes(8).toString("hex");
const now = () => new Date().toISOString();

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
const fail = (res, status, detail) => send(res, status, { detail });
const body = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

function summary(d) {
  const x = d.draft;
  return {
    id: d.id, name: x.name, to: x.to, status: d.status, awaiting: d.awaiting, created_at: x.created_at,
    template: { id: x.request.template_id, version: x.request.template_version },
    frame: x.frame ? { id: x.frame.id, version: x.frame.version } : null, image_sha256: x.image_sha256,
  };
}

function review(d, role, approve, by, note) {
  // Only reviews of the current image count, as in argus-mint.
  if (d.status !== "pending" || !d.awaiting.includes(role)) return `the ${role} can't review this draft now`;
  d.draft.reviews = [...(d.draft.reviews ?? []), { role, decision: approve ? "approved" : "rejected", by, at: now(), image_sha256: d.draft.image_sha256, note }];
  d.awaiting = d.awaiting.filter((r) => r !== role);
  d.status = !approve ? "rejected" : d.awaiting.length ? "pending" : "approved";
  return null;
}

const catalogue = { templates: [templates, "template"], frames: [frames, "frame"], bios: [bios, "bio"] };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://mock");
  const p = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
  try {
    if (req.method === "GET") {
      if (url.pathname === "/health") return send(res, 200, health);
      if (p.length === 1 && catalogue[p[0]]) return send(res, 200, catalogue[p[0]][0]);
      if (p[0] === "frames" && p[3] === "overlay") return send(res, 200, png(`frames/${p[1]}/${p[2]}/overlay.png`), "image/png");
      if (p[0] === "frames" && p[3] === "fonts") {
        const rel = p.slice(4).map(decodeURIComponent).join("/");
        const file = join(root, "frames", p[1], p[2], "fonts", rel);
        return rel.includes("..") || !existsSync(file) ? fail(res, 404, "no such font") : send(res, 200, readFileSync(file), "font/ttf");
      }
      if (url.pathname === "/drafts") {
        const status = url.searchParams.get("status");
        const items = [...drafts.values()].filter((d) => !status || d.status === status).map(summary).reverse();
        return send(res, 200, { items, total: items.length });
      }
      if (p[0] === "drafts" && p.length === 2) return drafts.has(p[1]) ? send(res, 200, drafts.get(p[1])) : fail(res, 404, `no draft ${p[1]}`);
      if (p[0] === "drafts" && p.length === 3) return images.has(p[1]) ? send(res, 200, images.get(p[1])[p[2] === "art" ? "art" : "image"], "image/png") : fail(res, 404, "no draft");
      if (url.pathname === "/samples") {
        const items = [...samples.values()].reverse();
        return send(res, 200, { items, total: items.length });
      }
      if (p[0] === "samples" && p.length === 2) return samples.has(p[1]) ? send(res, 200, samples.get(p[1])) : fail(res, 404, "no sample job");
      if (p[0] === "samples" && p.length === 4) {
        const img = sampleImages.get(`${p[1]}/${p[2]}/${p[3]}`);
        return img ? send(res, 200, img, "image/png") : fail(res, 404, "no image");
      }
      return fail(res, 404, "not found");
    }
    const b = await body(req);
    if (url.pathname === "/drafts") {
      const base = structuredClone(drafts.get(pendingId));
      const id = id16();
      Object.assign(base.draft, { name: b.name, to: b.to, texts: b.texts ?? {}, created_at: now(), reviews: [] });
      Object.assign(base, { id, status: "pending", awaiting: ["moderator", "owner"], published: null });
      drafts.set(id, base);
      images.set(id, images.get(pendingId));
      await new Promise((r) => setTimeout(r, STEP_MS));
      return send(res, 201, base);
    }
    if (p[0] === "drafts" && p[2] === "challenge") {
      const d = drafts.get(p[1]);
      if (!d) return fail(res, 404, "no draft");
      const statement = b.action === "edit" ? `Change the card text of argus-mint draft ${d.id}.` : `${b.approve ? "Approve" : "Reject"} the card image of argus-mint draft ${d.id} for minting.`;
      const message = `localhost:3108 wants you to sign in with your Ethereum account:\n${d.draft.to}\n\n${statement}\n\nURI: https://localhost:3108\nVersion: 1\nChain ID: 84532\nNonce: mock${id16()}\nIssued At: ${now()}\nResources:\n- urn:argus-mint:draft:${d.id}\n- urn:sha256:${d.draft.image_sha256}`;
      return send(res, 200, { message, nonce: "mock", expires_at: new Date(Date.now() + 600_000).toISOString() });
    }
    if (p[0] === "drafts" && p[2] === "review") {
      const d = drafts.get(p[1]);
      if (!d) return fail(res, 404, "no draft");
      const problem = review(d, b.role, b.approve, b.role === "owner" ? d.draft.to : b.by, b.note ?? "");
      return problem ? fail(res, 409, problem) : send(res, 200, d);
    }
    if (p[0] === "frames" && p[3] === "layout") {
      const entry = frames.find((e) => e.frame.id === p[1] && e.frame.version === Number(p[2]));
      if (!entry) return fail(res, 404, "no frame");
      const slots = {};
      for (const [slot, text] of Object.entries(b.texts ?? {})) {
        const box = entry.frame.texts?.[slot];
        if (!box) return fail(res, 422, `no text slot ${slot}`);
        if (text) slots[slot] = recordedLayouts.get(`${slot}\u0000${text.split(/\s+/).join(" ")}`) ?? approxLayout(box, text);
      }
      return send(res, 200, { width: entry.width, height: entry.height, slots });
    }
    if (p[0] === "drafts" && p[2] === "edit") {
      // The owner's text and style edits. The mock can't redraw the card, so the image stays the same;
      // the record changes as argus-mint's would (new image hash, both approvals again, the edit recorded).
      const d = drafts.get(p[1]);
      if (!d) return fail(res, 404, "no draft");
      if (d.status === "published") return fail(res, 409, "a published card can't be edited");
      const fields = [];
      if (b.name && b.name !== d.draft.name) (d.draft.name = b.name), fields.push("name");
      if (b.bio && d.draft.bio && b.bio !== d.draft.bio.text) {
        if (d.draft.description === d.draft.bio.text) d.draft.description = b.bio;
        d.draft.bio = { ...d.draft.bio, text: b.bio, edited: true };
        fields.push("bio");
      }
      for (const [slot, text] of Object.entries(b.texts ?? {})) {
        if ((d.draft.texts[slot] ?? "") === text) continue;
        if (text) d.draft.texts[slot] = text;
        else delete d.draft.texts[slot];
        fields.push(`texts.${slot}`);
      }
      if (b.style !== undefined && b.style !== null && JSON.stringify(b.style) !== JSON.stringify(d.draft.style ?? {})) {
        const plain = !b.style.tint && !Object.keys(b.style.slots ?? {}).length;
        d.draft.style = plain ? null : b.style;
        fields.push("style");
      }
      if (!fields.length) return fail(res, 409, "nothing changed");
      // The mock can't bake: the image stays, the record changes as argus-mint's would.
      d.draft.image_sha256 = randomBytes(32).toString("hex");
      const by = d.draft.to; // only the owner edits
      d.draft.edits = [...(d.draft.edits ?? []), { role: "owner", by, at: now(), fields, image_sha256: d.draft.image_sha256 }];
      Object.assign(d, { status: "pending", awaiting: ["moderator", "owner"] });
      return send(res, 200, d);
    }
    if (p[0] === "drafts" && p[2] === "publish") {
      const d = drafts.get(p[1]);
      if (!d) return fail(res, 404, "no draft");
      if (d.status !== "approved") return fail(res, 409, "the card image still needs approval");
      d.published = { ...structuredClone(published), reviews: d.draft.reviews };
      d.published.metadata.name = d.draft.name;
      d.status = "published";
      return send(res, 200, d);
    }
    if (p.length === 4 && catalogue[p[0]] && p[3] === "review") {
      const [list, kind] = catalogue[p[0]];
      const entry = list.find((e) => e[kind].id === p[1] && e[kind].version === Number(p[2]));
      if (!entry) return fail(res, 404, `no ${kind}`);
      const obj = entry[kind];
      if (b.decision === "approve" && obj.status !== "draft") return fail(res, 409, "only a draft can be approved");
      if (b.decision === "retire" && obj.status !== "approved") return fail(res, 409, "only an approved file can be retired");
      obj.status = b.decision === "approve" ? "approved" : "retired";
      if (b.decision === "approve") Object.assign(obj, { approved_by: b.by, approved_at: now().slice(0, 10) });
      return send(res, 200, { kind, id: obj.id, version: obj.version, status: obj.status, hash: entry.hash, file: entry.file });
    }
    if (url.pathname === "/samples") {
      const id = id16();
      const job = { id, status: "running", created_at: now(), finished_at: null, error: null, request: { count: 4, variables: {}, seed: 0, name: "Sample", texts: {}, ...b }, items: [] };
      samples.set(id, job);
      const recorded = template.items;
      for (let n = 1; n <= job.request.count; n++) {
        setTimeout(() => {
          const from = recorded[(n - 1) % recorded.length];
          job.items.push({ ...from, n, framed: from.framed && Boolean(b.frame) });
          for (const which of ["art", "framed"]) {
            const img = sampleImages.get(`${template.id}/${from.n}/${which}`);
            if (img) sampleImages.set(`${id}/${n}/${which}`, img);
          }
          if (n === job.request.count) Object.assign(job, { status: "done", finished_at: now() });
        }, n * STEP_MS);
      }
      return send(res, 202, job);
    }
    if (p[0] === "frames" && p[3] === "preview") {
      const any = [...sampleImages.entries()].find(([k]) => k.endsWith("/framed"));
      return any ? send(res, 200, any[1], "image/png") : fail(res, 404, "no recorded framed image");
    }
    return fail(res, 404, "not found");
  } catch (e) {
    return fail(res, 500, String(e));
  }
}).listen(port, () => console.log(`mock argus-mint on http://localhost:${port} (fixture: ${root}${existsSync(root) ? "" : " MISSING"})`));
