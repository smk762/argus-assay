/**
 * argus-mint, in the browser, for the static demo: the same answers scripts/mock_mint.mjs gives,
 * from the tape, with state in memory (this tab, until reload):
 *   - reviews change a draft's status, as argus-mint's do (only reviews of the current image count)
 *   - the owner's edit changes the record as argus-mint's would, but can't redraw: the image stays
 *   - publishing reuses the tape's recorded publish result (local CIDs, the fixture's voucher)
 *   - catalogue decisions stick
 *   - the teaser projects on the tape can be read, as recorded
 * Nothing that needs a GPU or the server's files runs here: making drafts and samples, the frame
 * preview, and authoring or reviewing a teaser project's files answer 503 (the page keeps those controls off or hidden before that).
 * It checks no token and no signature, like the mock. Its /health says `mock: true`, which offers
 * "Approve as demo owner" in place of a wallet.
 *
 * Pure apart from the clock and the random ids, both injectable for tests.
 */
import type { Tape } from "./tape";
import type { DraftDetail, DraftSummary, FrameLayout, Health, ProjectDetail, ProjectTracker, PublishResult, ReadyTeaser, SlotLayout, TextSlot } from "./types";

export interface DemoResponse {
  status: number;
  body: unknown;
}

export interface DemoMintOptions {
  now?: () => string;
  randomHex?: (bytes: number) => string;
}

type Box = TextSlot & { x: number; y: number; width: number; height: number };

function defaultHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Without Pillow, a new text gets an approximate layout: average glyph width ~0.5em (as the mock). */
export function approxLayout(box: Box, text: string): SlotLayout {
  const size = box.size ?? 48;
  const perLine = Math.max(1, Math.floor(box.width / (size * 0.5)));
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (box.wrap && cur && `${cur} ${w}`.length > perLine) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const ascent = Math.round(size * 0.8);
  const descent = Math.round(size * 0.25);
  const lineH = Math.round((ascent + descent) * (box.line_spacing ?? 1.15));
  const blockH = lineH * (lines.length - 1) + ascent + descent;
  let y = box.valign === "top" ? box.y : box.y + Math.floor((box.height - blockH) / 2);
  return {
    font: box.font ?? null,
    size,
    ascent,
    descent,
    effects: { shadow: Math.max(1, Math.round(size * 0.06)), outline: Math.max(1, Math.round(size * 0.05)), glow: Math.max(2, Math.round(size * 0.18)) },
    lines: lines.map((t) => {
      const w = t.length * size * 0.5;
      const x = box.align === "left" ? box.x : box.align === "right" ? box.x + box.width - w : box.x + (box.width - w) / 2;
      const line = { text: t, x: Math.round(x), y };
      y += lineH;
      return line;
    }),
  } as SlotLayout;
}

// ---- A teaser's layers: the same reads scripts/mock_teasers.mjs gives (parity.test.ts), ported line for line.

type Teaser = NonNullable<DraftDetail["draft"]["teaser"]>;
type Links = { teasers?: Record<string, Record<"line" | "identity" | "scene", { id: string; version: number }>> } | null;

const NOT_RECORDED = (pid: string, what: string) => `${what} of project ${pid} wasn't recorded in this fixture (recorded before argus-mint had it)`;

/** The newest approved teaser links of a project detail (argus-mint's `current_teasers`), or null. */
function currentLinks(detail: ProjectDetail | undefined): Links {
  const approved = (detail?.files ?? []).filter((f) => f.kind === "teasers" && f.status === "approved");
  return (approved.sort((a, b) => b.version - a.version)[0]?.doc as Links) ?? null;
}

/** argus-mint's posting.is_current. */
function isCurrent(t: Teaser, links: Links): boolean {
  const link = links?.teasers?.[t.number];
  if (!link) return false;
  return (["line", "identity", "scene"] as const).every((k) => link[k].id === t[k].id && link[k].version === t[k].version);
}

const newestFirst = (a: DraftDetail, b: DraftDetail) => (a.draft.created_at < b.draft.created_at ? 1 : a.draft.created_at > b.draft.created_at ? -1 : 0);
const teaserDrafts = (drafts: Iterable<DraftDetail>, pid: string | null) =>
  [...drafts].filter((d) => d.draft.kind === "teaser" && d.draft.teaser && (!pid || d.draft.teaser.project.id === pid));

/** The recorded tracker, with each teaser's drafts and draft-based stages read from the drafts now. */
function trackerNow(recorded: ProjectTracker, drafts: Iterable<DraftDetail>, links: Links): ProjectTracker {
  const out = structuredClone(recorded);
  const all = [...drafts];
  for (const t of out.teasers) {
    const mine = teaserDrafts(all, out.project).filter((d) => d.draft.teaser!.number === t.number).sort(newestFirst);
    t.drafts = mine.map((d) => ({
      id: d.id,
      status: d.status,
      awaiting: d.awaiting,
      created_at: d.draft.created_at,
      links_version: d.draft.teaser!.links.version,
      background: d.draft.teaser!.background.id,
      current: isCurrent(d.draft.teaser!, links),
    }));
    t.stages = {
      ...t.stages,
      image_made: t.drafts.some((s) => s.current && (s.status === "approved" || s.status === "published")),
      posted: mine.some((d) => (d.posts ?? []).length > 0),
      minted: t.drafts.some((s) => s.status === "published"),
    };
  }
  return out;
}

// A copy, as a fresh HTTP response would be: the page must never hold (or mutate) the state itself.
const ok = (body: unknown, status = 200): DemoResponse => ({ status, body: structuredClone(body) });
const fail = (status: number, detail: string): DemoResponse => ({ status, body: { detail } });

export interface FrameRoute {
  id: string;
  version: number;
  what: string;
  rest: string;
}
const FRAME_ROUTE = /^\/frames\/([a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?)\/(\d+)\/([a-z]+)(?:\/(.+))?$/;
/**
 * A frame route: `/frames/<id>/<version>/<what>[/<rest>]`. A project's own frame is `<project>/<name>` (wire 1.16),
 * sent with the `/` plain or as `%2F`; argus-mint routes on the decoded path, and the version (digits) followed by a
 * fixed word parses only one way. scripts/mock_mint.mjs frameRoute is the same (parity.test.ts, frameIds.test.ts).
 */
export function frameRoute(pathname: string): FrameRoute | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const m = FRAME_ROUTE.exec(path);
  return m ? { id: m[1], version: Number(m[2]), what: m[3], rest: m[4] ?? "" } : null;
}

export class DemoMint {
  private readonly health: Health;
  private readonly drafts = new Map<string, DraftDetail>();
  private readonly layouts = new Map<string, SlotLayout>();
  private readonly published: PublishResult | null;
  private readonly now: () => string;
  private readonly hex: (bytes: number) => string;
  /** A copy: catalogue decisions change it, the loaded tape stays as recorded. */
  private readonly tape: Tape;

  constructor(tape: Tape, options: DemoMintOptions = {}) {
    this.tape = structuredClone(tape);
    this.now = options.now ?? (() => new Date().toISOString());
    this.hex = options.randomHex ?? defaultHex;
    // Nothing here renders, so the demo says so in the capabilities: the page and the client's own
    // gate (api.ts requireCapability) both keep those writes off. Nor is there a darkroom to check a
    // template against (scripts/mock_mint.mjs says the same).
    this.health = {
      ...structuredClone(tape.health),
      mock: true,
      capabilities: {
        ...tape.health.capabilities,
        create_drafts: false,
        sample: false,
        check_templates: false,
        author_catalogue: false,
        // A teaser's layers are there to read: nothing renders, posts, scores or trains here.
        backgrounds: false,
        teasers: false,
        post: false,
        identity_training: false,
        identity_check: false,
      },
    } as Health;
    for (const d of this.tape.drafts) this.drafts.set(d.id, d);
    for (const layout of Object.values(tape.layouts)) {
      for (const [slot, l] of Object.entries(layout.slots ?? {})) this.layouts.set(`${slot}\u0000${l.lines.map((x) => x.text).join(" ")}`, l);
    }
    this.published = tape.drafts.find((d) => d.published)?.published ?? null;
  }

  /** What the tape is and when argus-mint recorded it, for the page's Sample data / Recorded line. */
  provenance(): Tape["provenance"] & { recorded_at: string } {
    return { ...this.tape.provenance, recorded_at: this.tape.recorded_at };
  }

  private summary(d: DraftDetail): DraftSummary {
    const x = d.draft;
    return {
      id: d.id,
      name: x.name,
      to: x.to,
      status: d.status,
      awaiting: d.awaiting,
      created_at: x.created_at,
      template: { id: x.request.template_id, version: x.request.template_version },
      frame: x.frame ? { id: x.frame.id, version: x.frame.version } : null,
      image_sha256: x.image_sha256,
      kind: x.kind ?? "card",
      teaser: x.teaser ? { project: x.teaser.project.id, number: x.teaser.number } : null,
    } as DraftSummary;
  }

  /** A read of a project's layers (scripts/mock_teasers.mjs readLayer), or null when the path isn't one. */
  private layer(pathname: string): DemoResponse | null {
    const p = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (p[0] !== "projects" || p.length < 3) return null;
    const pid = p[1];
    const detail = this.tape.project_details.find((d) => d.id === pid);
    const layers = this.tape.project_layers[pid];
    const known = p.length === 3 ? ["backgrounds", "tracker"].includes(p[2]) : p.length === 6 ? (p[2] === "scenes" && p[5] === "backgrounds") || (p[2] === "identities" && p[5] === "training") : p.length === 8 && p[2] === "identities" && p[6] === "candidates";
    if (!known) return null;
    if (!detail) return fail(404, `no project '${pid}'`);
    if (p[2] === "backgrounds") return layers?.backgrounds ? ok(layers.backgrounds) : fail(404, NOT_RECORDED(pid, "the backgrounds"));
    if (p[2] === "scenes") {
      if (!layers?.backgrounds) return fail(404, NOT_RECORDED(pid, "the backgrounds"));
      const set = layers.backgrounds.sets.find((s) => s.scene === p[3] && s.scene_version === Number(p[4]));
      return set ? ok(set) : fail(404, `scene ${p[3]} v${p[4]} of project ${pid} has no backgrounds yet`);
    }
    if (p[2] === "tracker") return layers?.tracker ? ok(trackerNow(layers.tracker, this.drafts.values(), currentLinks(detail))) : fail(404, NOT_RECORDED(pid, "the tracker"));
    if (p.length === 8) return fail(404, `${p[3]} v${p[4]} has no recorded candidate ${p[7]}`);
    const view = layers?.training[`${p[3]}@${Number(p[4])}`];
    return view ? ok(view) : fail(404, NOT_RECORDED(pid, `the training view of ${p[3]} v${Number(p[4])}`));
  }

  /** `GET /posts/ready`, worked out from the drafts as argus-mint does (scripts/mock_teasers.mjs readyPosts). */
  private ready(query: URLSearchParams): DemoResponse {
    const project = query.get("project");
    const limit = Number(query.get("limit") ?? 50);
    const offset = Number(query.get("offset") ?? 0);
    if ((project !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(project)) || !Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0)
      return fail(422, "project is an id, limit 1 to 200, offset 0 or more");
    const linksOf = (pid: string) => currentLinks(this.tape.project_details.find((d) => d.id === pid));
    const items: ReadyTeaser[] = teaserDrafts(this.drafts.values(), project)
      .filter((d) => d.status === "approved" || d.status === "published")
      .sort(newestFirst)
      .map((d) => {
        const x = d.draft;
        const t = x.teaser!;
        const approvals = (x.reviews ?? []).filter((r) => r.image_sha256 === x.image_sha256 && r.decision === "approved").map((r) => r.at);
        return {
          id: d.id,
          project: t.project.id,
          title: x.name.endsWith(` ${t.number}`) ? x.name.slice(0, -(t.number.length + 1)) : x.name,
          number: t.number,
          status: d.status as ReadyTeaser["status"],
          current: isCurrent(t, linksOf(t.project.id)),
          created_at: x.created_at,
          approved_at: approvals.sort().at(-1)!,
          image_url: `/drafts/${d.id}/image`,
          image_sha256: x.image_sha256,
          alt: t.alt,
          quote: x.texts?.quote ?? "",
          attribution: x.texts?.attribution ?? null,
          label: x.texts?.label ?? null,
          posted: (d.posts ?? []).length > 0,
          posts: d.posts ?? [],
        };
      });
    return ok({ items: items.slice(offset, offset + limit), total: items.length });
  }

  private catalogue(plural: string): { list: Record<string, unknown>[]; kind: "template" | "frame" | "bio" } | null {
    if (plural === "templates") return { list: this.tape.templates as unknown as Record<string, unknown>[], kind: "template" };
    if (plural === "frames") return { list: this.tape.frames as unknown as Record<string, unknown>[], kind: "frame" };
    if (plural === "bios") return { list: this.tape.bios as unknown as Record<string, unknown>[], kind: "bio" };
    return null;
  }

  get(pathAndQuery: string): DemoResponse {
    const url = new URL(pathAndQuery, "http://demo");
    const p = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/health") return ok(this.health);
    if (p.length === 1 && this.catalogue(p[0])) return ok(this.catalogue(p[0])!.list);
    if (url.pathname === "/library") return this.tape.library ? ok(this.tape.library) : fail(404, "no pre-rendered library is served here");
    if (url.pathname === "/drafts") {
      const status = url.searchParams.get("status");
      const items = [...this.drafts.values()].filter((d) => !status || d.status === status).map((d) => this.summary(d)).reverse();
      return ok({ items, total: items.length });
    }
    if (p[0] === "drafts" && p.length === 2) return this.drafts.has(p[1]) ? ok(this.drafts.get(p[1])) : fail(404, `no draft ${p[1]}`);
    if (url.pathname === "/samples") {
      const items = [...this.tape.samples].reverse();
      return ok({ items, total: items.length });
    }
    if (url.pathname === "/posts/ready") return this.ready(url.searchParams);
    const layer = this.layer(url.pathname);
    if (layer) return layer;
    if (url.pathname === "/projects") return ok(this.tape.projects);
    if (p[0] === "projects" && p.length === 2) {
      const project = this.tape.project_details.find((d) => d.id === p[1]);
      return project ? ok(project) : fail(404, `no project ${p[1]}`);
    }
    if (p[0] === "samples" && p.length === 2) {
      const job = this.tape.samples.find((s) => s.id === p[1]);
      return job ? ok(job) : fail(404, "no sample job");
    }
    return fail(404, "not found");
  }

  post(path: string, b: Record<string, unknown>): DemoResponse {
    const p = new URL(path, "http://demo").pathname.split("/").filter(Boolean);
    const draft = p[0] === "drafts" && p.length === 3 ? this.drafts.get(p[1]) : undefined;
    if (p[0] === "drafts" && p.length === 3 && !draft) return fail(404, "no draft");
    if (draft && p[2] === "challenge") return ok(this.challenge(draft, b));
    if (draft && p[2] === "review") return this.review(draft, b);
    if (draft && p[2] === "edit") return this.edit(draft, b);
    if (draft && p[2] === "publish") return this.publish(draft);
    if (draft && p[2] === "posted") return fail(503, "Recording a post needs a running argus-mint (argus-herald reports to it)");
    if (draft && p[2] === "identity-check") return fail(503, "The identity check needs a running argus-mint and argus-proof");
    const fr = frameRoute(new URL(path, "http://demo").pathname);
    if (fr?.what === "layout" && !fr.rest) return this.layout(fr.id, fr.version, (b.texts ?? {}) as Record<string, string>);
    // A frame's review takes a project's two-part id too (frameRoute); a template's or bio's id is one segment.
    if (fr?.what === "review" && !fr.rest) return this.decide(this.catalogue("frames")!.list, "frame", fr.id, fr.version, b);
    const cat = p.length === 4 && p[0] !== "frames" && p[3] === "review" ? this.catalogue(p[0]) : null;
    if (cat) return this.decide(cat.list, cat.kind, p[1], Number(p[2]), b);
    if ((p[0] === "drafts" || p[0] === "samples") && p.length === 1) return fail(503, `${p[0] === "drafts" ? "Making a draft" : "Rendering samples"} needs a running argus-mint and a GPU`);
    if (p[0] === "projects" && p[2] === "files") return fail(503, "Authoring and reviewing a teaser project need a running argus-mint");
    if (p[0] === "projects" && p.length > 2)
      return fail(503, "Rendering and reviewing backgrounds, making teaser drafts and training identities need a running argus-mint");
    if (fr?.what === "preview" && !fr.rest) return fail(503, "The frame preview is drawn by a running argus-mint");
    return fail(404, "not found");
  }

  private challenge(d: DraftDetail, b: Record<string, unknown>) {
    const statement =
      b.action === "edit" ? `Change the card text of argus-mint draft ${d.id}.` : `${b.approve ? "Approve" : "Reject"} the card image of argus-mint draft ${d.id} for minting.`;
    const domain = this.health.siwe_domain ?? "localhost:3108";
    const message =
      `${domain} wants you to sign in with your Ethereum account:\n${d.draft.to}\n\n${statement}\n\nURI: https://${domain}\nVersion: 1\n` +
      `Chain ID: ${this.health.chain_id ?? 84532}\nNonce: demo${this.hex(8)}\nIssued At: ${this.now()}\nResources:\n- urn:argus-mint:draft:${d.id}\n- urn:sha256:${d.draft.image_sha256}`;
    return { message, nonce: "demo", expires_at: new Date(Date.parse(this.now()) + 600_000).toISOString() };
  }

  private review(d: DraftDetail, b: Record<string, unknown>): DemoResponse {
    const role = String(b.role);
    if (d.status !== "pending" || !d.awaiting.includes(role)) return fail(409, `the ${role} can't review this draft now`);
    const approve = Boolean(b.approve);
    const by = role === "owner" ? d.draft.to : String(b.by ?? "");
    d.draft.reviews = [
      ...(d.draft.reviews ?? []),
      { role, decision: approve ? "approved" : "rejected", by, at: this.now(), image_sha256: d.draft.image_sha256, note: String(b.note ?? "") },
    ] as DraftDetail["draft"]["reviews"];
    d.awaiting = d.awaiting.filter((r) => r !== role);
    d.status = !approve ? "rejected" : d.awaiting.length ? "pending" : "approved";
    return ok(d);
  }

  private edit(d: DraftDetail, b: Record<string, unknown>): DemoResponse {
    if (d.status === "published") return fail(409, "a published card can't be edited");
    const x = d.draft;
    const fields: string[] = [];
    if (typeof b.name === "string" && b.name && b.name !== x.name) {
      x.name = b.name;
      fields.push("name");
    }
    if (typeof b.bio === "string" && b.bio && x.bio && b.bio !== x.bio.text) {
      if (x.description === x.bio.text) x.description = b.bio;
      x.bio = { ...x.bio, text: b.bio, edited: true };
      fields.push("bio");
    }
    const texts = { ...(x.texts ?? {}) } as Record<string, string>;
    for (const [slot, text] of Object.entries((b.texts ?? {}) as Record<string, string>)) {
      if ((texts[slot] ?? "") === text) continue;
      if (text) texts[slot] = text;
      else delete texts[slot];
      fields.push(`texts.${slot}`);
    }
    x.texts = texts;
    const style = b.style as { tint?: unknown; slots?: Record<string, unknown> } | null | undefined;
    if (style !== undefined && style !== null && JSON.stringify(style) !== JSON.stringify(x.style ?? {})) {
      const plain = !style.tint && !Object.keys(style.slots ?? {}).length;
      x.style = (plain ? null : style) as typeof x.style;
      fields.push("style");
    }
    if (!fields.length) return fail(409, "nothing changed");
    // No baking here: the image stays, and the record changes as argus-mint's would.
    x.image_sha256 = this.hex(32);
    x.edits = [...(x.edits ?? []), { role: "owner", by: x.to, at: this.now(), fields, image_sha256: x.image_sha256 }] as typeof x.edits;
    d.status = "pending";
    d.awaiting = ["moderator", "owner"];
    return ok(d);
  }

  private publish(d: DraftDetail): DemoResponse {
    if (d.status !== "approved") return fail(409, "the card image still needs approval");
    if (!this.published) return fail(503, "the tape holds no publish result to replay");
    const published = { ...structuredClone(this.published), reviews: d.draft.reviews } as unknown as PublishResult;
    (published.metadata as { name?: string }).name = d.draft.name;
    d.published = published;
    d.status = "published";
    return ok(d);
  }

  private layout(id: string, version: number, texts: Record<string, string>): DemoResponse {
    const entry = this.tape.frames.find((e) => e.frame.id === id && e.frame.version === version);
    if (!entry) return fail(404, "no frame");
    const slots: Record<string, SlotLayout> = {};
    for (const [slot, text] of Object.entries(texts)) {
      const box = entry.frame.texts?.[slot] as Box | undefined;
      if (!box) return fail(422, `no text slot ${slot}`);
      if (text) slots[slot] = this.layouts.get(`${slot}\u0000${text.split(/\s+/).join(" ")}`) ?? approxLayout(box, text);
    }
    return ok({ width: entry.width, height: entry.height, slots } as FrameLayout);
  }

  private decide(list: Record<string, unknown>[], kind: "template" | "frame" | "bio", id: string, version: number, b: Record<string, unknown>): DemoResponse {
    const entry = list.find((e) => {
      const obj = e[kind] as { id: string; version: number };
      return obj.id === id && obj.version === version;
    });
    if (!entry) return fail(404, `no ${kind}`);
    // As argus-mint's wire: "approve" or "retire", nothing else. Anything else would otherwise fall through to "retired".
    if (b.decision !== "approve" && b.decision !== "retire") return fail(422, 'decision must be "approve" or "retire"');
    const obj = entry[kind] as { id: string; version: number; status: string; approved_by?: string | null; approved_at?: string | null };
    if (b.decision === "approve" && obj.status !== "draft") return fail(409, "only a draft can be approved");
    if (b.decision === "retire" && obj.status !== "approved") return fail(409, "only an approved file can be retired");
    obj.status = b.decision === "approve" ? "approved" : "retired";
    if (b.decision === "approve") Object.assign(obj, { approved_by: String(b.by ?? ""), approved_at: this.now().slice(0, 10) });
    return ok({ kind, id: obj.id, version: obj.version, status: obj.status, hash: entry.hash, file: entry.file });
  }
}
