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
      const message = `localhost:3108 wants you to sign in with your Ethereum account:\n${d.draft.to}\n\n${b.approve ? "Approve" : "Reject"} the card image of argus-mint draft ${d.id} for minting.\n\nURI: https://localhost:3108\nVersion: 1\nChain ID: 84532\nNonce: mock${id16()}\nIssued At: ${now()}\nResources:\n- urn:argus-mint:draft:${d.id}\n- urn:sha256:${d.draft.image_sha256}`;
      return send(res, 200, { message, nonce: "mock", expires_at: new Date(Date.now() + 600_000).toISOString() });
    }
    if (p[0] === "drafts" && p[2] === "review") {
      const d = drafts.get(p[1]);
      if (!d) return fail(res, 404, "no draft");
      const problem = review(d, b.role, b.approve, b.role === "owner" ? d.draft.to : b.by, b.note ?? "");
      return problem ? fail(res, 409, problem) : send(res, 200, d);
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
