// Generated from smk762/argus-mint@a731915bef88f0d5bcbe072853a30e725eab0079 schema/mint-wire.schema.json.
// Do not edit: change schema/pins.json and run `npm run wire:pull`.

export interface MintWire {
  ArtSource?: ArtSource;
  BioInfo?: BioInfo;
  BioRecord?: BioRecord;
  BioRef?: BioRef;
  BioTemplate?: BioTemplate;
  Capabilities?: Capabilities;
  CardDraft?: CardDraft;
  CatalogueDecision?: CatalogueDecision;
  CatalogueEntry?: CatalogueEntry;
  Challenge?: Challenge;
  ChallengeRequest?: ChallengeRequest;
  CreateDraft?: CreateDraft;
  DraftDetail?: DraftDetail;
  DraftList?: DraftList;
  DraftSummary?: DraftSummary;
  Frame?: Frame;
  FrameInfo?: FrameInfo;
  FramePreviewRequest?: FramePreviewRequest;
  FrameRef?: FrameRef;
  Health?: Health;
  LoraRef?: LoraRef;
  PublishRequest?: PublishRequest;
  PublishResult?: PublishResult;
  Rect?: Rect;
  Ref?: Ref;
  RenderRequest?: RenderRequest;
  Review?: Review;
  ReviewRequest?: ReviewRequest;
  SampleItem?: SampleItem;
  SampleJob?: SampleJob;
  SampleJobList?: SampleJobList;
  SampleRequest?: SampleRequest;
  Sampling?: Sampling;
  Template?: Template;
  TemplateInfo?: TemplateInfo;
  TextSlot?: TextSlot;
}
/**
 * Existing art to preview a frame on: a draft's render, or a sample's.
 */
export interface ArtSource {
  draft?: string | null;
  n?: number | null;
  sample?: string | null;
}
export interface BioInfo {
  bio: BioTemplate;
  file: string;
  hash: string;
}
/**
 * One version of a bio template, as reviewed and recorded in its YAML file.
 */
export interface BioTemplate {
  approved_at?: string | null;
  approved_by?: string | null;
  id: string;
  max_attempts?: number;
  max_chars?: number;
  max_tokens?: number;
  model: string;
  prompt: string;
  status: "draft" | "approved" | "retired";
  system: string;
  temperature?: number;
  version: number;
}
/**
 * The bio written for this card: its template and model, the text, and every attempt.
 */
export interface BioRecord {
  attempts: {
    [k: string]: unknown;
  }[];
  ref: BioRef;
  text: string;
}
/**
 * The reviewed bio template (and model) that wrote the card's bio (see :mod:`argus_mint.bios`).
 */
export interface BioRef {
  hash: string;
  id: string;
  model: string;
  version: number;
}
/**
 * What this server will do. A client disables a control whose capability is false.
 */
export interface Capabilities {
  create_drafts: boolean;
  moderate: boolean;
  owner_review: boolean;
  publish: boolean;
  review_catalogue?: boolean;
  sample?: boolean;
  write_bios: boolean;
}
/**
 * Everything needed to publish a card, except the pins and the signature.
 */
export interface CardDraft {
  art_sha256: string;
  asset_id: string;
  attempts: {
    [k: string]: unknown;
  }[];
  bio?: BioRecord | null;
  consumer: string;
  created_at: string;
  description?: string;
  external_url?: string | null;
  format?: 1;
  frame?: FrameRef | null;
  image_sha256: string;
  name: string;
  renderer: string;
  request: RenderRequest;
  reviews?: Review[];
  texts?: {
    [k: string]: string;
  };
  to: string;
}
/**
 * The reviewed frame composited onto the render (see :mod:`argus_mint.frames`).
 */
export interface FrameRef {
  hash: string;
  id: string;
  version: number;
}
/**
 * Everything a renderer needs, fully determined by template version + values + seed.
 */
export interface RenderRequest {
  height: number;
  loras: LoraRef[];
  model: string;
  negative: string;
  prompt: string;
  sampling: Sampling | null;
  seed: number;
  template_hash: string;
  template_id: string;
  template_version: number;
  variables: {
    [k: string]: string;
  };
  width: number;
}
/**
 * A LoRA by file name, with its weight and the trigger words the renderer appends.
 *
 * A bare string in YAML means ``{name: <string>, weight: 1.0}``.
 */
export interface LoraRef {
  name: string;
  trigger_words?: string[];
  weight?: number;
}
/**
 * Sampler settings, fixed by the reviewed template so a render is reproducible.
 */
export interface Sampling {
  cfg: number;
  clip_skip?: number;
  sampler: string;
  scheduler: string;
  steps: number;
}
export interface Review {
  at: string;
  by: string;
  decision: "approved" | "rejected";
  image_sha256: string;
  note?: string;
  role: "moderator" | "owner";
}
/**
 * POST /{templates,frames,bios}/{id}/{version}/review (moderator token).
 */
export interface CatalogueDecision {
  by: string;
  decision: "approve" | "retire";
}
export interface CatalogueEntry {
  file: string;
  hash: string;
  id: string;
  kind: "template" | "frame" | "bio";
  status: "draft" | "approved" | "retired";
  version: number;
}
export interface Challenge {
  expires_at: string;
  message: string;
  nonce: string;
}
/**
 * POST /drafts/{id}/challenge: the owner asks for the message to sign.
 */
export interface ChallengeRequest {
  approve: boolean;
}
/**
 * POST /drafts. The template, frame and bio are named by id and version, never by path.
 */
export interface CreateDraft {
  asset?: string | null;
  asset_id?: string | null;
  bio?: Ref | null;
  description?: string;
  external_url?: string | null;
  frame?: Ref | null;
  name: string;
  seed: number;
  template: Ref;
  texts?: {
    [k: string]: string;
  };
  to: string;
  variables: {
    [k: string]: string;
  };
}
export interface Ref {
  id: string;
  version: number;
}
export interface DraftDetail {
  awaiting: string[];
  draft: CardDraft;
  id: string;
  published?: PublishResult | null;
  status: "pending" | "approved" | "rejected" | "published";
}
export interface PublishResult {
  metadata: {
    [k: string]: unknown;
  };
  metadata_cid: string;
  render: {
    [k: string]: unknown;
  };
  reviews: {
    [k: string]: unknown;
  }[];
  signature: string;
  signer: string;
  typed_data: {
    [k: string]: unknown;
  };
  voucher: {
    [k: string]: unknown;
  };
}
export interface DraftList {
  items: DraftSummary[];
  total: number;
}
export interface DraftSummary {
  awaiting: string[];
  created_at: string;
  frame: Ref | null;
  id: string;
  image_sha256: string;
  name: string;
  status: "pending" | "approved" | "rejected" | "published";
  template: Ref;
  to: string;
}
/**
 * One version of a frame, as reviewed and recorded in its YAML file.
 */
export interface Frame {
  approved_at?: string | null;
  approved_by?: string | null;
  id: string;
  overlay: string;
  status: "draft" | "approved" | "retired";
  texts?: {
    [k: string]: TextSlot;
  };
  version: number;
  window: Rect;
}
/**
 * A box for one piece of card text.
 *
 * The text is drawn at ``size`` if it fits, else at the largest size down to ``min_size``
 * that fits; with ``wrap`` it breaks across lines. If it doesn't fit even at ``min_size``,
 * it is clipped and ends in an ellipsis.
 */
export interface TextSlot {
  align?: "left" | "center" | "right";
  colour?: string;
  font?: string | null;
  height: number;
  line_spacing?: number;
  min_size?: number;
  size?: number;
  valign?: "top" | "middle";
  width: number;
  wrap?: boolean;
  x: number;
  y: number;
}
export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
export interface FrameInfo {
  file: string;
  frame: Frame;
  hash: string;
  height: number;
  width: number;
}
/**
 * POST /frames/{id}/{version}/preview: a frame (any status) on existing art; returns a PNG.
 */
export interface FramePreviewRequest {
  art: ArtSource;
  bio?: string | null;
  name?: string;
  texts?: {
    [k: string]: string;
  };
}
export interface Health {
  backends: {
    [k: string]: boolean;
  };
  capabilities: Capabilities;
  card: string | null;
  chain_id: number;
  consumer: string;
  network: string;
  read_only: boolean;
  reviewers: string[];
  service?: "argus-mint";
  siwe_domain: string | null;
  version: string;
  wire_version?: string;
}
export interface PublishRequest {
  deadline?: number | null;
  price?: number;
}
/**
 * POST /drafts/{id}/review.
 *
 * The moderator sends ``Authorization: Bearer <token>`` and ``by``; the owner sends the
 * signed challenge (``message`` + ``signature``), and ``by`` is their address.
 */
export interface ReviewRequest {
  approve: boolean;
  by?: string | null;
  message?: string | null;
  note?: string;
  role: "moderator" | "owner";
  signature?: string | null;
}
export interface SampleItem {
  art?: boolean;
  attempts?: {
    [k: string]: unknown;
  }[];
  bio?: string | null;
  bio_attempts?: {
    [k: string]: unknown;
  }[];
  bio_error?: string | null;
  error?: string | null;
  framed?: boolean;
  n: number;
  prompt?: string | null;
  seed?: number | null;
  variables: {
    [k: string]: string;
  };
}
export interface SampleJob {
  created_at: string;
  error?: string | null;
  finished_at?: string | null;
  id: string;
  items?: SampleItem[];
  request: SampleRequest;
  status: "queued" | "running" | "done" | "failed";
}
/**
 * POST /samples: render sample cards of a template (any status) for its reviewer.
 */
export interface SampleRequest {
  bio?: Ref | null;
  count?: number;
  frame?: Ref | null;
  name?: string;
  seed?: number;
  template: Ref;
  texts?: {
    [k: string]: string;
  };
  variables?: {
    [k: string]: string;
  };
}
export interface SampleJobList {
  items: SampleJob[];
  total: number;
}
/**
 * One version of a render template, as reviewed and recorded in its YAML file.
 */
export interface Template {
  approved_at?: string | null;
  approved_by?: string | null;
  height: number;
  id: string;
  loras?: LoraRef[];
  max_attempts?: number;
  model: string;
  negative?: string;
  prompt: string;
  sampling?: Sampling | null;
  status: "draft" | "approved" | "retired";
  variables: {
    [k: string]: string[];
  };
  version: number;
  width: number;
}
export interface TemplateInfo {
  combinations: number;
  file: string;
  hash: string;
  template: Template;
}
