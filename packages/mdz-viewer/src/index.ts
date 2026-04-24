/**
 * Public entry point for `@mdz-format/viewer`.
 *
 * Importing this module registers the `<mdz-viewer>` custom element
 * globally. The class is also re-exported for callers that want to
 * subclass or instantiate programmatically.
 */

export {
  MDZViewerElement,
  default,
} from "./mdz-viewer.js";
export { loadArchive, ArchiveLoadError, getAssetURL } from "./archive.js";
export type { LoadedArchive } from "./archive.js";
export type {
  Manifest,
  DocumentInfo,
  ContentConfig,
  AssetEntry,
  Author,
  AcceptedMimeType,
} from "./manifest-types.js";
export { ACCEPTED_MIME_TYPES } from "./manifest-types.js";
export type {
  MDZLoadedEventDetail,
  MDZErrorEventDetail,
} from "./mdz-viewer.js";
export { renderMarkdown } from "./render.js";
export type { RenderOptions } from "./render.js";
