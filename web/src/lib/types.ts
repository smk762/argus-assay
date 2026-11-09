// The wire types, generated from argus-mint's pinned schema (`npm run wire:types`), re-exported
// under the names the app uses.
export type {
  BioInfo,
  BioTemplate,
  Capabilities,
  CardDraft,
  CatalogueEntry,
  Challenge,
  CreateDraft,
  DraftDetail,
  DraftList,
  DraftSummary,
  Frame,
  FrameInfo,
  Health,
  PublishResult,
  Ref,
  Review,
  SampleItem,
  SampleJob,
  SampleJobList,
  SampleRequest,
  Template,
  TemplateInfo,
  TextEdit,
  FrameLayout,
  LibraryItem,
  LibraryListing,
  LoraChoice,
  LoraOption,
  Sampling,
  SlotLayout,
  AutoCheck,
  Edit,
  TextSlot,
} from "./generated/mint";

export type DraftStatus = "pending" | "approved" | "rejected" | "published";
export type CatalogueKind = "template" | "frame" | "bio";
export type CatalogueStatus = "draft" | "approved" | "retired";

/** The wire major this build understands. argus-mint reports its own in `/health.wire_version`. */
export const WIRE_MAJOR = "1";
