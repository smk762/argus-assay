// Generated from smk762/argus-mint@b0c308e904c6d20c211905021e82fdcccbcd7396 schema/mint-wire.schema.json.
// Do not edit: change schema/pins.json and run `npm run wire:pull`.

export interface MintWire {
  ArtSource?: ArtSource;
  AutoCheck?: AutoCheck;
  Background?: Background;
  BackgroundDecision?: BackgroundDecision;
  BackgroundJob?: BackgroundJob;
  BackgroundReview?: BackgroundReview;
  BackgroundSet?: BackgroundSet;
  BackgroundSetList?: BackgroundSetList;
  Barrel?: Barrel;
  BioInfo?: BioInfo;
  BioRecord?: BioRecord;
  BioRef?: BioRef;
  BioTemplate?: BioTemplate;
  Candidate?: Candidate;
  Capabilities?: Capabilities;
  Caption?: Caption;
  CardDraft?: CardDraft;
  CardStyle?: CardStyle;
  CatalogueDecision?: CatalogueDecision;
  CatalogueEntry?: CatalogueEntry;
  Challenge?: Challenge;
  ChallengeRequest?: ChallengeRequest;
  ChromaticAberration?: ChromaticAberration;
  CreateDraft?: CreateDraft;
  CreateTeaserDraft?: CreateTeaserDraft;
  DraftDetail?: DraftDetail;
  DraftList?: DraftList;
  DraftPosts?: DraftPosts;
  DraftSummary?: DraftSummary;
  Edit?: Edit;
  EditTextRequest?: EditTextRequest;
  Evaluation?: Evaluation;
  FailedBackground?: FailedBackground;
  FailedCandidate?: FailedCandidate;
  Frame?: Frame;
  FrameInfo?: FrameInfo;
  FrameLayout?: FrameLayout;
  FramePreviewRequest?: FramePreviewRequest;
  FrameRef?: FrameRef;
  Health?: Health;
  IdentityCheck?: IdentityCheck;
  IdentityTrainingView?: IdentityTrainingView;
  InitImageRef?: InitImageRef;
  LayoutRequest?: LayoutRequest;
  LibraryItem?: LibraryItem;
  LibraryListing?: LibraryListing;
  LineLayout?: LineLayout;
  LoraChoice?: LoraChoice;
  LoraOption?: LoraOption;
  LoraRef?: LoraRef;
  Noise?: Noise;
  Pinned?: Pinned;
  Post?: Post;
  PostRequest?: PostRequest;
  ProjectChecks?: ProjectChecks;
  ProjectDetail?: ProjectDetail;
  ProjectFile?: ProjectFile;
  ProjectList?: ProjectList;
  ProjectSummary?: ProjectSummary;
  ProjectTracker?: ProjectTracker;
  PublishRequest?: PublishRequest;
  PublishResult?: PublishResult;
  ReadyTeaser?: ReadyTeaser;
  ReadyTeasers?: ReadyTeasers;
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
  SaveProjectFile?: SaveProjectFile;
  SavedProjectFile?: SavedProjectFile;
  Scanlines?: Scanlines;
  ScoreBox?: ScoreBox;
  ScorerFile?: ScorerFile;
  Selection?: Selection;
  SlotBackground?: SlotBackground;
  SlotLayout?: SlotLayout;
  SlotStyle?: SlotStyle;
  StepRun?: StepRun;
  TeaserBackground?: TeaserBackground;
  TeaserDraftState?: TeaserDraftState;
  TeaserFile?: TeaserFile;
  TeaserOf?: TeaserOf;
  TeaserProgress?: TeaserProgress;
  TeaserRecord?: TeaserRecord;
  TeaserStages?: TeaserStages;
  Template?: Template;
  TemplateCheck?: TemplateCheck;
  TemplateInfo?: TemplateInfo;
  TextCheck?: TextCheck;
  TextEdit?: TextEdit;
  TextSlot?: TextSlot;
  Tint?: Tint;
  TrainedLora?: TrainedLora;
  TrainingRecord?: TrainingRecord;
  Vignette?: Vignette;
}
/**
 * Existing art to preview a frame on: a draft's render, or a sample's.
 */
export interface ArtSource {
  draft?: string | null;
  n?: number | null;
  sample?: string | null;
}
/**
 * What the platform's checks found for the current image. ``passed`` recorded the moderator's approval.
 *
 * ``passed`` is only ever true with auto-moderation on: with it off, a teaser's checks (and its
 * ``identity`` check) are still recorded, held for a person with the reason that it is off.
 */
export interface AutoCheck {
  at: string;
  checks: string[];
  held?: string[];
  identity?: IdentityCheck | null;
  image_sha256: string;
  passed: boolean;
}
/**
 * argus-proof's score of a teaser's figure against its identity's held-out references (#51).
 *
 * ``outcome``: ``passed`` (``score`` >= ``min_score``), ``below`` (under it), ``uncalibrated``
 * (scored, but the identity has no ``min_score`` yet), ``skipped`` (nothing to score: a
 * viewpoint identity, or an embodied one with no ``proof_export`` yet), ``unavailable`` (proof
 * is unreachable, answered 503, or isn't configured) or ``error`` (proof refused the request,
 * or its answer can't be read). ``reason`` says it in words. Only ``passed`` (or a viewpoint's
 * ``skipped``) lets auto-moderation stand in for the moderator; ``below``, ``unavailable``,
 * ``error`` and an embodied ``skipped`` hold the draft.
 *
 * ``art_sha256`` is the unframed art that was scored, ``crop`` the scene's ``character_area``
 * in its pixels; ``scorer``, ``scorer_version`` and ``model_file`` are proof's provenance for
 * ``metric``'s scorer, and ``proof_version`` its wire version.
 */
export interface IdentityCheck {
  art_sha256: string;
  at: string;
  crop?: ScoreBox | null;
  export?: string | null;
  metric?: ("identity" | "likeness") | null;
  min_score?: number | null;
  model_file?: ScorerFile | null;
  outcome: "passed" | "below" | "uncalibrated" | "skipped" | "unavailable" | "error";
  presence: "embodied" | "viewpoint";
  proof_version?: string | null;
  reason: string;
  score?: number | null;
  scorer?: string | null;
  scorer_version?: string | null;
}
/**
 * The part of an image proof scored, in the image's own pixels.
 */
export interface ScoreBox {
  height: number;
  width: number;
  x: number;
  y: number;
}
/**
 * The weights a proof scorer loaded, pinned by sha256 (proof's ``ModelRef``).
 */
export interface ScorerFile {
  name: string;
  sha256: string;
}
/**
 * One rendered background and its review. ``status`` is ``pending`` until the moderator decides.
 */
export interface Background {
  attempts: {
    [k: string]: unknown;
  }[];
  created_at: string;
  file: string;
  id: string;
  made_with?: {
    [k: string]: string;
  };
  n: number;
  request: RenderRequest;
  review?: BackgroundReview | null;
  seed: number;
  sha256: string;
  status?: "pending" | "approved" | "rejected";
}
/**
 * Everything a renderer needs, fully determined by template version + values + seed.
 *
 * A teaser's renders are not of a template: a background's ``template_*`` name its scene, and
 * an inpainted figure's name its identity (each file's id, version and hash). ``init_image``
 * is set only for an inpainted figure.
 */
export interface RenderRequest {
  height: number;
  init_image?: InitImageRef | null;
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
 * An inpainting (or image-to-image) input, by hash: the bytes travel beside the request.
 *
 * ``sha256`` is of the image bytes sent and ``mask_sha256`` of the mask's (white repaints,
 * black keeps); darkroom's record names both as ``source_sha256``, and the client checks them.
 */
export interface InitImageRef {
  denoise: number;
  mask_sha256?: string | null;
  sha256: string;
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
  guidance?: number | null;
  sampler: string;
  scheduler: string;
  steps: number;
}
/**
 * The moderator's decision on one background image, bound to its sha256.
 */
export interface BackgroundReview {
  at: string;
  by: string;
  decision: "approved" | "rejected";
  image_sha256: string;
  note?: string;
}
/**
 * POST /projects/{id}/backgrounds/{bg}/review: the moderator's decision on one background.
 */
export interface BackgroundDecision {
  by: string;
  decision: "approve" | "reject";
  note?: string;
}
/**
 * The last rendering job for a set. A job left queued or running by a restart reads as failed.
 */
export interface BackgroundJob {
  created_at: string;
  error?: string | null;
  finished_at?: string | null;
  id: string;
  numbers: number[];
  status: "queued" | "running" | "done" | "failed";
}
/**
 * ``manifest.json``: the backgrounds of one scene version.
 */
export interface BackgroundSet {
  backgrounds?: Background[];
  failed?: FailedBackground[];
  format?: 1;
  job?: BackgroundJob | null;
  project: string;
  scene: string;
  scene_hash: string;
  scene_version: number;
  wanted: number;
}
/**
 * A background that made no image. ``final``: the safety check refused every attempt, so
 * rendering it again would only repeat them; otherwise an error stopped it and a new job retries.
 */
export interface FailedBackground {
  attempts: {
    [k: string]: unknown;
  }[];
  error: string;
  final: boolean;
  n: number;
  seed: number;
}
/**
 * GET /projects/{id}/backgrounds: each scene version's backgrounds, by scene then version.
 */
export interface BackgroundSetList {
  sets: BackgroundSet[];
}
/**
 * A lens's bulge: the centre magnified, the window's corners kept where they are.
 *
 * A pixel at distance ``r`` from the centre (1 at a corner) shows the art at
 * ``r * (1 + strength * r^2) / (1 + strength)``. 0.1 is mild, 0.3 strong.
 */
export interface Barrel {
  strength: number;
  type: "barrel";
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
  edited?: boolean;
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
export interface Candidate {
  attempts: {
    [k: string]: unknown;
  }[];
  file: string;
  made_with?: {
    [k: string]: string;
  };
  n: number;
  request: RenderRequest;
  seed: number;
  sha256: string;
}
/**
 * What this server will do. A client disables a control whose capability is false.
 */
export interface Capabilities {
  author_catalogue?: boolean;
  auto_moderate?: boolean;
  backgrounds?: boolean;
  check_templates?: boolean;
  create_drafts: boolean;
  edit_text?: boolean;
  identity_check?: boolean;
  identity_training?: boolean;
  library?: boolean;
  moderate: boolean;
  owner_review: boolean;
  post?: boolean;
  publish: boolean;
  review_catalogue?: boolean;
  sample?: boolean;
  teasers?: boolean;
  write_bios: boolean;
}
export interface Caption {
  file: string;
  text: string;
}
/**
 * Everything needed to publish a card, except the pins and the signature.
 *
 * ``kind`` is ``card`` (a game card: ``asset_id``, ``consumer``, maybe a bio) or ``teaser``
 * (an image and quote from a teaser project: ``teaser`` records what made it, and it has no
 * asset id, consumer or bio). Both are reviewed the same way; ``to`` is the owner who signs.
 */
export interface CardDraft {
  art_sha256: string;
  asset_id?: string | null;
  attempts: {
    [k: string]: unknown;
  }[];
  auto_check?: AutoCheck | null;
  bio?: BioRecord | null;
  consumer?: string | null;
  created_at: string;
  description?: string;
  edits?: Edit[];
  external_url?: string | null;
  format?: 1;
  frame?: FrameRef | null;
  image_sha256: string;
  kind?: "card" | "teaser";
  library?: string | null;
  made_with?: {
    [k: string]: string;
  };
  name: string;
  renderer: string;
  request: RenderRequest;
  reviews?: Review[];
  style?: CardStyle | null;
  teaser?: TeaserRecord | null;
  texts?: {
    [k: string]: string;
  };
  to: string;
}
/**
 * A change to the card's text, which redraws the card image on the same art.
 */
export interface Edit {
  at: string;
  by: string;
  fields: string[];
  image_sha256: string;
  role: "moderator" | "owner";
}
/**
 * The reviewed frame composited onto the render (see :mod:`argus_mint.frames`).
 */
export interface FrameRef {
  hash: string;
  id: string;
  version: number;
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
 * The owner's styling of a framed card: any colours, so be it if that's black on black.
 */
export interface CardStyle {
  slots?: {
    [k: string]: SlotStyle;
  };
  tint?: Tint | null;
}
/**
 * How one text slot is drawn. Unset fields keep the frame's own choices.
 */
export interface SlotStyle {
  background?: SlotBackground | null;
  colour?: string | null;
  effect?: "none" | "shadow" | "outline" | "glow";
  effect_colour?: string;
}
/**
 * A filled, rounded box behind a text slot.
 */
export interface SlotBackground {
  colour: string;
  opacity?: number;
  padding?: number;
  radius?: number;
}
/**
 * Recolour the frame overlay: every pixel moves toward ``colour`` at its own brightness.
 */
export interface Tint {
  colour: string;
  strength?: number;
}
/**
 * What a teaser draft was made from: its project, number, each linked file and the background.
 *
 * The frame is the draft's own ``frame``. The quote, attribution and label drawn on it are the
 * draft's ``texts`` (by slot), from the reviewed line and project, never edited.
 */
export interface TeaserRecord {
  alt: string;
  background: TeaserBackground;
  identity: TeaserFile;
  line: TeaserFile;
  links: TeaserFile;
  number: string;
  presence: "embodied" | "viewpoint";
  project: TeaserFile;
  scene: TeaserFile;
}
/**
 * The approved background a teaser was made on.
 */
export interface TeaserBackground {
  id: string;
  sha256: string;
}
/**
 * A reviewed project file a teaser was made from, by id, version and hash (0x keccak256).
 */
export interface TeaserFile {
  hash: string;
  id: string;
  version: number;
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
 *
 * ``action: review`` with ``approve``; ``action: edit`` with the exact ``edit`` it will authorise.
 */
export interface ChallengeRequest {
  action?: "review" | "edit";
  approve?: boolean;
  edit?: TextEdit | null;
}
/**
 * The owner's change to the card: text and style. ``None`` leaves a field as it is; an empty
 * slot text clears it; ``style`` replaces the whole style (an empty one clears it).
 */
export interface TextEdit {
  bio?: string | null;
  name?: string | null;
  style?: CardStyle | null;
  texts?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
    [k: string]: string;
  } | null;
}
/**
 * Colour fringing: red spreads out from the centre and blue pulls in, by ``shift`` pixels at the edges.
 */
export interface ChromaticAberration {
  shift: number;
  type: "chromatic_aberration";
}
/**
 * POST /drafts. The template, frame and bio are named by id and version, never by path.
 *
 * Either render (``variables``, ``seed``, optionally ``model``), or take a pre-rendered
 * ``library`` entry, whose variables, seed and checkpoint then apply.
 */
export interface CreateDraft {
  asset?: string | null;
  asset_id?: string | null;
  bio?: Ref | null;
  description?: string;
  external_url?: string | null;
  frame?: Ref | null;
  library?: string | null;
  loras?: LoraChoice[];
  model?: string | null;
  name: string;
  seed?: number;
  style?: CardStyle | null;
  template: Ref;
  texts?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
    [k: string]: string;
  };
  to: string;
  variables?: {
    [k: string]: string;
  };
}
export interface Ref {
  id: string;
  version: number;
}
/**
 * A render's pick from the template's ``lora_options``. ``weight`` defaults to the first allowed.
 */
export interface LoraChoice {
  name: string;
  weight?: number | null;
}
/**
 * POST /projects/{id}/teasers/{n}/draft. Everything else comes from the project's reviewed files.
 */
export interface CreateTeaserDraft {
  to: string;
}
export interface DraftDetail {
  awaiting: string[];
  draft: CardDraft;
  id: string;
  posts?: Post[];
  published?: PublishResult | null;
  status: "pending" | "approved" | "rejected" | "published";
}
/**
 * One posting of a draft's image, as reported by whoever posted it (argus-herald).
 *
 * ``sha256`` is of the bytes that were posted, and must be the draft's ``image_sha256``: a teaser
 * PNG is baked with no metadata chunks, so a copy stripped of metadata hashes the same.
 * ``by`` says which token recorded it.
 */
export interface Post {
  at: string;
  by: "poster" | "moderator";
  recorded_at: string;
  sha256: string;
  url?: string | null;
  where: string;
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
  kind?: "card" | "teaser";
  name: string;
  status: "pending" | "approved" | "rejected" | "published";
  teaser?: TeaserOf | null;
  template: Ref;
  to: string;
}
export interface TeaserOf {
  number: string;
  project: string;
}
/**
 * A draft's posts, in the order recorded (the answer to POST /drafts/{id}/posted).
 */
export interface DraftPosts {
  id: string;
  image_sha256: string;
  posts: Post[];
}
/**
 * POST /drafts/{id}/edit: only the owner edits, with the signed challenge for exactly this edit.
 *
 * The moderator approves or rejects; they don't change the card.
 */
export interface EditTextRequest {
  bio?: string | null;
  message: string;
  name?: string | null;
  signature: string;
  style?: CardStyle | null;
  texts?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
    [k: string]: string;
  } | null;
}
export interface Evaluation {
  metric: "identity" | "likeness";
  min_score: number | null;
  passed: boolean;
  pending: boolean;
  proof_passed: boolean;
  proof_run: string;
  reasons?: string[];
  score: number | null;
}
/**
 * A candidate that made no image. ``final``: the safety check refused every attempt.
 */
export interface FailedCandidate {
  attempts: {
    [k: string]: unknown;
  }[];
  error: string;
  final: boolean;
  n: number;
  seed: number;
}
/**
 * One version of a frame, as reviewed and recorded in its YAML file.
 */
export interface Frame {
  approved_at?: string | null;
  approved_by?: string | null;
  /**
   * @maxItems 8
   */
  effects?:
    | []
    | [Barrel | Scanlines | Noise | ChromaticAberration | Vignette]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ]
    | [
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette,
        Barrel | Scanlines | Noise | ChromaticAberration | Vignette
      ];
  id: string;
  overlay: string;
  status: "draft" | "approved" | "retired";
  style_locked?: boolean;
  texts?: {
    [k: string]: TextSlot;
  };
  version: number;
  window: Rect;
}
/**
 * Dark horizontal lines: ``thickness`` rows in every ``spacing``, darkened by ``opacity``.
 */
export interface Scanlines {
  opacity: number;
  spacing: number;
  thickness: number;
  type: "scanlines";
}
/**
 * Signal noise: each pixel moves by up to ``amount`` of full scale, up or down, evenly spread.
 * ``monochrome``: the same change in each channel (grain); else each channel its own (colour speckle).
 */
export interface Noise {
  amount: number;
  monochrome: boolean;
  type: "noise";
}
/**
 * Dark corners: from ``start`` (a fraction of the centre-to-corner distance) the art darkens
 * smoothly, to ``strength`` at the corners.
 */
export interface Vignette {
  start: number;
  strength: number;
  type: "vignette";
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
/**
 * GET /frames. ``file`` is relative to the frames directory, or for a project's own frame
 * (``project`` set, id ``<project>/<name>``) to the projects directory.
 */
export interface FrameInfo {
  file: string;
  frame: Frame;
  hash: string;
  height: number;
  project?: string | null;
  width: number;
}
export interface FrameLayout {
  height: number;
  slots: {
    [k: string]: SlotLayout;
  };
  width: number;
}
export interface SlotLayout {
  ascent: number;
  descent: number;
  effects: {
    [k: string]: number;
  };
  font: string | null;
  lines: LineLayout[];
  size: number;
}
export interface LineLayout {
  text: string;
  x: number;
  y: number;
}
/**
 * POST /frames/{id}/{version}/preview: a frame (any status) on existing art; returns a PNG.
 */
export interface FramePreviewRequest {
  art: ArtSource;
  bio?: string | null;
  name?: string;
  style?: CardStyle | null;
  texts?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
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
/**
 * GET /projects/{id}/identities/{identity}/{version}/training: the record, and each step's status
 * as mint works it out (a job a restart cut off reads as failed). ``next``: the one step the
 * moderator may start now, if any.
 */
export interface IdentityTrainingView {
  identity: string;
  next: ("candidates" | "select" | "caption" | "train" | "evaluate" | "pin") | null;
  project: string;
  record: TrainingRecord | null;
  steps: {
    [k: string]: "not_started" | "queued" | "running" | "done" | "failed";
  };
  version: number;
}
/**
 * ``record.json``: one identity version's training, every step run kept.
 */
export interface TrainingRecord {
  candidates?: Candidate[];
  captions?: Caption[];
  evaluation?: Evaluation | null;
  failed?: FailedCandidate[];
  format?: 1;
  identity: string;
  identity_hash: string;
  identity_version: number;
  lora?: TrainedLora | null;
  metric: "identity" | "likeness";
  pinned?: Pinned | null;
  project: string;
  runs?: StepRun[];
  selection?: Selection | null;
}
export interface TrainedLora {
  forge_run: string;
  name: string;
  output_name: string;
  sha256: string;
  trigger: string;
}
export interface Pinned {
  identity_version: number;
  lora: string;
  proof_export: string;
  proof_run: string;
  sha256: string;
}
/**
 * One run of one step: what it was given, which sibling run or scan it made, what came of it.
 */
export interface StepRun {
  error?: string | null;
  finished_at?: string | null;
  inputs?: {
    [k: string]: unknown;
  };
  job: string;
  outputs?: {
    [k: string]: unknown;
  };
  sibling?: {
    [k: string]: string;
  };
  started_at: string;
  status: "queued" | "running" | "done" | "failed";
  step: "candidates" | "select" | "caption" | "train" | "evaluate" | "pin";
}
/**
 * Curator's pick, split by mint. Files are candidate files; the two sets never share one.
 */
export interface Selection {
  anchors?: string[];
  held_out: string[];
  held_out_sha256: string[];
  kept: number;
  proof_export: string;
  scan_id: string;
  train: string[];
  train_export: string;
  train_sha256: string[];
}
/**
 * POST /frames/{id}/{version}/layout: where these texts go, for a browser preview.
 */
export interface LayoutRequest {
  texts: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
    [k: string]: string;
  };
}
export interface LibraryItem {
  group: number;
  id: string;
  model: string;
  seed: number;
  sha256: string;
  variables: {
    [k: string]: string;
  };
}
/**
 * GET /library: pre-rendered portraits, for drafts without a GPU (``CreateDraft.library``).
 */
export interface LibraryListing {
  count: number;
  items: LibraryItem[];
  models: string[];
  template: Ref;
}
/**
 * A LoRA a card may choose (reviewed with the template), at one of its allowed weights.
 *
 * ``models``: the checkpoints it may pair with (a LoRA belongs to one family); empty means any
 * the template allows.
 */
export interface LoraOption {
  models?: string[];
  name: string;
  trigger_words?: string[];
  weights?: number[];
}
/**
 * POST /drafts/{id}/posted: a post of an approved teaser's image (poster or moderator token).
 *
 * ``sha256`` is of the bytes posted and must equal the draft's ``image_sha256``.
 */
export interface PostRequest {
  at: string;
  sha256: string;
  url?: string | null;
  where: string;
}
/**
 * What stands between a project's files and approval.
 *
 * ``spoiler_rules`` are numbers in the private spoiler list, never its terms. ``guard_ran`` is
 * false when no darkroom is configured: then nothing can be approved.
 */
export interface ProjectChecks {
  guard: TextCheck[];
  guard_ran: boolean;
  problems: string[];
  spoiler_rules: number[];
}
/**
 * SingGuard's verdict on one text, under the project's policy (darkroom's text pre-flight).
 *
 * The verdict is stored in the file's ``guard`` block and holds while the text and the policy
 * are the ones it judged.
 */
export interface TextCheck {
  detail?: string;
  field: string;
  passed: boolean;
}
/**
 * GET /projects/{id}: every file of a project (teaser links included, kind ``teasers``) and their checks.
 *
 * ``checks.guard`` holds the verdicts stored in the files that still hold; a text with none
 * hasn't been checked since it (or the project's policy) last changed.
 */
export interface ProjectDetail {
  checks: ProjectChecks;
  files: ProjectFile[];
  id: string;
}
export interface ProjectFile {
  doc: {
    [k: string]: unknown;
  };
  file: string;
  hash: string;
  id: string;
  kind: "project" | "identity" | "scene" | "line" | "teasers";
  status: "draft" | "approved" | "retired";
  version: number;
}
export interface ProjectList {
  projects: ProjectSummary[];
}
export interface ProjectSummary {
  id: string;
  status: "draft" | "approved" | "retired";
  title: string;
}
/**
 * GET /projects/{id}/tracker: each teaser of the newest approved links (none: ``links_version`` null).
 */
export interface ProjectTracker {
  links_version: number | null;
  project: string;
  teasers: TeaserProgress[];
}
export interface TeaserProgress {
  background: string | null;
  drafts: TeaserDraftState[];
  number: string;
  stages: TeaserStages;
}
/**
 * One teaser draft, as the tracker lists it. ``current``: made from the current links' line,
 * identity and scene (an older draft of the same number may not be).
 */
export interface TeaserDraftState {
  awaiting: string[];
  background: string;
  created_at: string;
  current: boolean;
  id: string;
  links_version: number;
  status: "pending" | "approved" | "rejected" | "published";
}
/**
 * The stages a teaser has reached, as argus-mint works them out (a client never does).
 */
export interface TeaserStages {
  concept_chosen: boolean;
  image_made: boolean;
  minted?: boolean;
  posted?: boolean;
  quote_final: boolean;
}
export interface PublishRequest {
  deadline?: number | null;
  price?: number;
}
/**
 * One approved teaser, as GET /posts/ready lists it for a poster (argus-herald).
 *
 * ``image_url`` is the draft's image route, relative to argus-mint's base URL; its bytes hash to
 * ``image_sha256``. ``posted`` is true once a post is recorded; such a teaser stays listed.
 * ``current`` is false for a draft made from another line, identity or scene than the
 * project's current teaser links name for that number (a newer draft supersedes it).
 */
export interface ReadyTeaser {
  alt: string;
  approved_at: string;
  attribution: string | null;
  created_at: string;
  current: boolean;
  id: string;
  image_sha256: string;
  image_url: string;
  label: string | null;
  number: string;
  posted: boolean;
  posts: Post[];
  project: string;
  quote: string;
  status: "approved" | "published";
  title: string;
}
/**
 * GET /posts/ready: approved (and published) teaser drafts, newest first, paged.
 */
export interface ReadyTeasers {
  items: ReadyTeaser[];
  total: number;
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
  loras?: LoraChoice[];
  model?: string | null;
  name?: string;
  seed?: number;
  style?: CardStyle | null;
  template: Ref;
  texts?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
     */
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
 * POST /projects/{id}/files/{kind}/{item}/{version}: write a draft file.
 *
 * ``doc`` is the file's content without ``status``, ``approved_by`` or ``approved_at``: a saved
 * file is always a draft, and ``guard`` is written by the server alone. An approved or
 * retired file never changes; save a new version.
 */
export interface SaveProjectFile {
  doc: {
    [k: string]: unknown;
  };
}
export interface SavedProjectFile {
  checks: ProjectChecks;
  file: ProjectFile;
}
/**
 * One version of a render template, as reviewed and recorded in its YAML file.
 */
export interface Template {
  approved_at?: string | null;
  approved_by?: string | null;
  height: number;
  id: string;
  lora_options?: LoraOption[];
  loras?: LoraRef[];
  max_attempts?: number;
  max_loras?: number;
  model: string;
  models?: string[];
  negative?: string;
  negative_by_family?: {
    [k: string]: string;
  };
  prompt: string;
  sampling?: Sampling | null;
  sampling_by_family?: {
    [k: string]: Sampling;
  };
  sampling_by_model?: {
    [k: string]: Sampling;
  };
  status: "draft" | "approved" | "retired";
  variables: {
    [k: string]: string[];
  };
  version: number;
  width: number;
}
/**
 * GET /templates/{id}/{version}/check: what would make darkroom refuse to render the template.
 *
 * Checked against darkroom's model list: checkpoints, LoRAs, sampler and scheduler exist, and a
 * workflow renders each checkpoint with every LoRA count the template allows, taking what the
 * template sends. Approving a template is refused while ``problems`` isn't empty.
 */
export interface TemplateCheck {
  ok: boolean;
  problems: string[];
  template: Ref;
}
export interface TemplateInfo {
  combinations: number;
  file: string;
  hash: string;
  template: Template;
}
