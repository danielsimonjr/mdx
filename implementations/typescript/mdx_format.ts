/**
 * MDZ Format Reference Implementation (TypeScript)
 * =================================================
 *
 * A TypeScript library for creating, reading, and manipulating MDZ
 * (Markdown Zipped Container) files. **Renamed from MDX on 2026-04-24**;
 * the legacy `MDX*` names continue to be exported as deprecated aliases.
 *
 * This implementation provides:
 * - MDZDocument: Main class for working with MDZ files
 * - MDZManifest: Manifest creation and validation
 * - Full type definitions for the MDZ format
 * - Browser and Node.js compatibility via JSZip
 * - Deprecated MDX* aliases for backward compatibility (remove after 2027-01-01)
 *
 * @example
 * ```typescript
 * // Create a new MDZ document
 * const doc = MDZDocument.create("My Document", { author: "Author Name" });
 * doc.setContent("# Hello World\n\nThis is my document.");
 * await doc.addImage(imageData, "figure.png", { altText: "Description" });
 * const blob = await doc.save();  // Returns a Blob
 *
 * // Read an existing MDZ document (also accepts legacy .mdx archives)
 * const doc = await MDZDocument.open(arrayBuffer);
 * console.log(doc.title);
 * console.log(doc.getContent());
 * ```
 *
 * @packageDocumentation
 */

import JSZip from "jszip";

// ============================================================================
// Constants
// ============================================================================

/** Current MDZ specification version */
export const MDZ_VERSION = "2.0.0";

/** MIME type for MDZ container files (new, preferred) */
export const MDZ_MIME_TYPE = "application/vnd.mdz-container+zip";

/**
 * Legacy MIME type from the pre-rename era. Readers MUST accept both
 * through 2027-01-01 per the backward-compat policy (CHANGELOG.md entry
 * under "Renamed: MDX → MDZ"). Writers SHOULD emit MDZ_MIME_TYPE.
 */
export const MDX_MIME_TYPE_LEGACY = "application/vnd.mdx-container+zip";

/** Default file extension (new, preferred) */
export const MDZ_EXTENSION = ".mdz";

/** Legacy extension, still accepted by readers through 2027-01-01. */
export const MDX_EXTENSION_LEGACY = ".mdx";

// ---------------------------------------------------------------------------
// Deprecated name aliases (remove after 2027-01-01)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `MDZ_VERSION`. Kept for backward compatibility; will be
 * removed after 2027-01-01. Both point at the same value.
 */
export const MDX_VERSION = MDZ_VERSION;

/**
 * @deprecated Use `MDZ_MIME_TYPE` (the new preferred type) or
 * `MDX_MIME_TYPE_LEGACY` (the old type, still accepted on read). Kept as
 * an alias of `MDZ_MIME_TYPE` for source-compat with code written before
 * the rename.
 */
export const MDX_MIME_TYPE = MDZ_MIME_TYPE;

/**
 * @deprecated Use `MDZ_EXTENSION` (new `.mdz`) or `MDX_EXTENSION_LEGACY`
 * (old `.mdx`). Kept as an alias of `MDZ_EXTENSION` for source-compat.
 */
export const MDX_EXTENSION = MDZ_EXTENSION;

// ============================================================================
// Enumerations
// ============================================================================

/**
 * Categories of assets that can be embedded in MDX documents.
 * Assets are organized by type within the archive structure.
 */
export enum AssetCategory {
  /** Raster and vector images (PNG, JPG, SVG, WebP, etc.) */
  IMAGES = "images",
  /** Video content (MP4, WebM, etc.) */
  VIDEO = "video",
  /** Audio content (MP3, WAV, FLAC, etc.) */
  AUDIO = "audio",
  /** 3D model files (glTF, GLB, STL, OBJ, etc.) */
  MODELS = "models",
  /** Embedded documents (PDF, HTML) */
  DOCUMENTS = "documents",
  /** Structured data files (CSV, JSON, Parquet, etc.) */
  DATA = "data",
  /** Custom CSS stylesheets */
  STYLES = "styles",
  /** JavaScript for interactivity (sandboxed) */
  SCRIPTS = "scripts",
  /** Embedded fonts (WOFF2, WOFF, TTF, etc.) */
  FONTS = "fonts",
  /** Uncategorized assets */
  OTHER = "other",
}

/**
 * Types of annotations supported by the MDX format.
 * Based on W3C Web Annotation Data Model motivations.
 */
export enum AnnotationType {
  /** General discussion comment */
  COMMENT = "commenting",
  /** Highlighted text without comment */
  HIGHLIGHT = "highlighting",
  /** Proposed edit or change */
  SUGGESTION = "editing",
  /** Request for clarification */
  QUESTION = "questioning",
  /** Personal marker/bookmark */
  BOOKMARK = "bookmarking",
}

/**
 * Status values for annotations.
 */
export enum AnnotationStatus {
  OPEN = "open",
  RESOLVED = "resolved",
  WONTFIX = "wontfix",
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  ANSWERED = "answered",
  ACTIVE = "active",
  ARCHIVED = "archived",
}

/**
 * Types of version snapshots.
 */
export enum SnapshotType {
  /** Complete copy of document and manifest */
  FULL = "full",
  /** Unified diff from base version */
  DIFF = "diff",
  /** Pointer to external VCS */
  REFERENCE = "reference",
}

// ============================================================================
// Extension to Category Mapping
// ============================================================================

/**
 * Maps file extensions to their corresponding asset categories.
 * Used for automatic categorization when adding assets.
 */
export const EXTENSION_TO_CATEGORY: Record<string, AssetCategory> = {
  // Images
  ".png": AssetCategory.IMAGES,
  ".jpg": AssetCategory.IMAGES,
  ".jpeg": AssetCategory.IMAGES,
  ".gif": AssetCategory.IMAGES,
  ".webp": AssetCategory.IMAGES,
  ".svg": AssetCategory.IMAGES,
  ".avif": AssetCategory.IMAGES,
  ".ico": AssetCategory.IMAGES,
  ".bmp": AssetCategory.IMAGES,
  // Video
  ".mp4": AssetCategory.VIDEO,
  ".webm": AssetCategory.VIDEO,
  ".ogg": AssetCategory.VIDEO,
  ".ogv": AssetCategory.VIDEO,
  ".mov": AssetCategory.VIDEO,
  ".avi": AssetCategory.VIDEO,
  ".mkv": AssetCategory.VIDEO,
  // Video captions
  ".vtt": AssetCategory.VIDEO,
  ".srt": AssetCategory.VIDEO,
  // Audio
  ".mp3": AssetCategory.AUDIO,
  ".wav": AssetCategory.AUDIO,
  ".flac": AssetCategory.AUDIO,
  ".oga": AssetCategory.AUDIO,
  ".m4a": AssetCategory.AUDIO,
  ".aac": AssetCategory.AUDIO,
  ".opus": AssetCategory.AUDIO,
  // 3D Models
  ".gltf": AssetCategory.MODELS,
  ".glb": AssetCategory.MODELS,
  ".stl": AssetCategory.MODELS,
  ".obj": AssetCategory.MODELS,
  ".fbx": AssetCategory.MODELS,
  ".usdz": AssetCategory.MODELS,
  ".dae": AssetCategory.MODELS,
  ".3ds": AssetCategory.MODELS,
  // Documents
  ".pdf": AssetCategory.DOCUMENTS,
  ".html": AssetCategory.DOCUMENTS,
  ".htm": AssetCategory.DOCUMENTS,
  // Data
  ".csv": AssetCategory.DATA,
  ".json": AssetCategory.DATA,
  ".tsv": AssetCategory.DATA,
  ".parquet": AssetCategory.DATA,
  ".xlsx": AssetCategory.DATA,
  ".xls": AssetCategory.DATA,
  ".xml": AssetCategory.DATA,
  ".yaml": AssetCategory.DATA,
  ".yml": AssetCategory.DATA,
  ".toml": AssetCategory.DATA,
  // Styles
  ".css": AssetCategory.STYLES,
  ".scss": AssetCategory.STYLES,
  ".less": AssetCategory.STYLES,
  // Scripts
  ".js": AssetCategory.SCRIPTS,
  ".mjs": AssetCategory.SCRIPTS,
  ".ts": AssetCategory.SCRIPTS,
  // Fonts
  ".woff2": AssetCategory.FONTS,
  ".woff": AssetCategory.FONTS,
  ".ttf": AssetCategory.FONTS,
  ".otf": AssetCategory.FONTS,
  ".eot": AssetCategory.FONTS,
};

/**
 * Common MIME types for various file extensions.
 */
export const EXTENSION_TO_MIME: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".vtt": "text/vtt",
  ".srt": "text/plain",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  // 3D Models
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".stl": "model/stl",
  ".obj": "model/obj",
  ".usdz": "model/vnd.usdz+zip",
  // Documents
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".htm": "text/html",
  // Data
  ".csv": "text/csv",
  ".json": "application/json",
  ".tsv": "text/tab-separated-values",
  ".parquet": "application/vnd.apache.parquet",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".xml": "application/xml",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".toml": "application/toml",
  // Styles
  ".css": "text/css",
  // Scripts
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  // Fonts
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  // Default
  ".txt": "text/plain",
  ".md": "text/markdown",
  // MDZ container (new, preferred)
  ".mdz": MDZ_MIME_TYPE,
  // MDX container (legacy; readers accept through 2027-01-01)
  ".mdx": MDX_MIME_TYPE_LEGACY,
};

// ============================================================================
// Type Definitions - Author and Contributors
// ============================================================================

/**
 * Represents a document author or contributor.
 */
export interface Author {
  /** Full name of the author */
  name: string;
  /** Email address (optional) */
  email?: string;
  /** Personal or professional URL (optional) */
  url?: string;
  /** Role in the document (e.g., "author", "editor", "reviewer") */
  role?: string;
  /** Organization or company affiliation (optional) */
  organization?: string;
}

/**
 * Options for creating an Author object.
 */
export interface AuthorOptions {
  email?: string;
  url?: string;
  role?: string;
  organization?: string;
}

// ============================================================================
// Type Definitions - Assets
// ============================================================================

/**
 * Base metadata common to all asset types.
 */
export interface BaseAssetMetadata {
  /** Path within the archive (e.g., "assets/images/figure-01.png") */
  path: string;
  /** MIME type of the asset */
  mime_type: string;
  /** File size in bytes */
  size_bytes: number;
  /**
   * Checksum for integrity verification (format: "algorithm:hex").
   * DEPRECATED in v2.0 — use `content_hash`. Retained for backward compat.
   */
  checksum?: string;
  /** Human-readable description */
  description?: string;
  /** Attribution or credit information */
  credit?: string;

  // --------------------------------------------------------------------------
  // v2.0 additions — all OPTIONAL, available on every asset type
  // --------------------------------------------------------------------------

  /** Content hash (v2.0 §9.3). Same format as `checksum`; supersedes it. */
  content_hash?: string;
  /** Per-asset accessibility metadata (v2.0 §14.3) */
  accessibility?: AssetAccessibility;
  /** Resolution/format alternatives for responsive delivery (v2.0 §17.2) */
  variants?: AssetVariant[];
  /** Per-locale alternatives for this asset (v2.0 §8.3) */
  locales?: AssetLocaleAlternative[];
}

/**
 * Metadata specific to image assets.
 */
export interface ImageAssetMetadata extends BaseAssetMetadata {
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Alt text for accessibility */
  alt_text?: string;
  /** Figure title or caption */
  title?: string;
}

/**
 * Caption/subtitle track information for video.
 */
export interface CaptionTrack {
  /** Path to the caption file (e.g., VTT) */
  path: string;
  /** BCP 47 language tag */
  language: string;
  /** Human-readable label */
  label: string;
  /** Track kind: "subtitles", "captions", "descriptions" */
  kind: "subtitles" | "captions" | "descriptions";
  /** Whether this is the default track */
  default?: boolean;
}

/**
 * Audio track information for video.
 */
export interface AudioTrack {
  /** BCP 47 language tag */
  language: string;
  /** Human-readable label */
  label: string;
  /** Whether this is the default track */
  default?: boolean;
}

/**
 * Metadata specific to video assets.
 */
export interface VideoAssetMetadata extends BaseAssetMetadata {
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Duration in seconds */
  duration_seconds?: number;
  /** Frame rate (e.g., 30, 60) */
  frame_rate?: number;
  /** Video codec (e.g., "H.264", "VP9") */
  codec?: string;
  /** Path to poster/thumbnail image */
  poster?: string;
  /** Caption tracks */
  captions?: CaptionTrack[];
  /** Audio tracks */
  audio_tracks?: AudioTrack[];
}

/**
 * Metadata specific to audio assets.
 */
export interface AudioAssetMetadata extends BaseAssetMetadata {
  /** Duration in seconds */
  duration_seconds?: number;
  /** Sample rate in Hz */
  sample_rate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Bit rate in bits per second */
  bit_rate?: number;
  /** Path to transcript file */
  transcript?: string;
}

/**
 * Metadata specific to 3D model assets.
 */
export interface ModelAssetMetadata extends BaseAssetMetadata {
  /** Model format version (e.g., "2.0" for glTF) */
  format_version?: string;
  /** Path to static preview image */
  preview?: string;
  /** Paths to binary buffer files (for glTF) */
  binary_buffers?: string[];
  /** Paths to texture files */
  textures?: string[];
  /** Whether the model contains animations */
  animations?: boolean;
  /** Vertex count */
  vertex_count?: number;
  /** Triangle/face count */
  triangle_count?: number;
}

/**
 * Metadata specific to document assets (PDFs, etc.).
 */
export interface DocumentAssetMetadata extends BaseAssetMetadata {
  /** Number of pages */
  pages?: number;
  /** Document title */
  title?: string;
  /** PDF version (for PDFs) */
  pdf_version?: string;
}

/**
 * Metadata specific to data assets (CSV, JSON, etc.).
 */
export interface DataAssetMetadata extends BaseAssetMetadata {
  /** Number of data rows */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Field delimiter (for CSV/TSV) */
  delimiter?: string;
  /** Whether the file has a header row */
  has_header?: boolean;
  /** Character encoding */
  encoding?: string;
  /** Path to JSON schema file */
  schema_ref?: string;
}

/**
 * Metadata specific to font assets.
 */
export interface FontAssetMetadata extends BaseAssetMetadata {
  /** Font family name */
  family?: string;
  /** Font weight (100-900) */
  weight?: number;
  /** Font style: "normal", "italic", "oblique" */
  style?: "normal" | "italic" | "oblique";
}

/**
 * Union type for all asset metadata types.
 */
export type AssetMetadata =
  | ImageAssetMetadata
  | VideoAssetMetadata
  | AudioAssetMetadata
  | ModelAssetMetadata
  | DocumentAssetMetadata
  | DataAssetMetadata
  | FontAssetMetadata
  | BaseAssetMetadata;

/**
 * Options for adding an asset to a document.
 */
export interface AddAssetOptions {
  /** Custom target filename (defaults to source filename) */
  targetName?: string;
  /** Alt text for images */
  altText?: string;
  /** Title or caption */
  title?: string;
  /** Credit/attribution */
  credit?: string;
  /** Description */
  description?: string;
  /** Force a specific category */
  category?: AssetCategory;
  /** Additional metadata fields */
  [key: string]: unknown;
}

// ============================================================================
// Type Definitions - Version History
// ============================================================================

/**
 * Snapshot information for a version.
 */
export interface VersionSnapshot {
  /** Type of snapshot */
  type: SnapshotType;
  /** Path to the snapshot file */
  path: string;
  /** Path to manifest snapshot (for full snapshots) */
  manifest_path?: string;
  /** Base version for diff snapshots */
  base_version?: string;
}

/**
 * Change summary for a version.
 */
export interface VersionChanges {
  /** Human-readable summary */
  summary?: string;
  /** List of added file paths */
  added?: string[];
  /** List of modified file paths */
  modified?: string[];
  /** List of removed file paths */
  removed?: string[];
}

/**
 * Represents a version entry in the document history.
 */
export interface VersionEntry {
  /** Version string (SemVer recommended) */
  version: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Author of this version */
  author: Author;
  /** Version message/description */
  message: string;
  /** Snapshot information */
  snapshot?: VersionSnapshot;
  /**
   * Parent version (null for initial). For merges, prefer
   * `parent_versions` — this field holds the "primary" parent when
   * the version has a single parent.
   */
  parent_version?: string | null;
  /**
   * Multi-parent ancestry for fork/merge DAG (v2.0 §15.4). Order is
   * significant: `parent_versions[0]` is the mainline parent (same as
   * `parent_version`); subsequent entries are merged-in branches.
   */
  parent_versions?: string[];
  /** Change summary */
  changes?: VersionChanges;
  /** Tags (e.g., "release", "draft") */
  tags?: string[];
}

/**
 * Version history file structure.
 */
export interface VersionHistory {
  /** Schema version for this file */
  schema_version: string;
  /** Current document version */
  current_version: string;
  /** List of all versions */
  versions: VersionEntry[];
}

// ============================================================================
// Type Definitions - Annotations
// ============================================================================

/**
 * Text quote selector (most common).
 */
export interface TextQuoteSelector {
  type: "TextQuoteSelector";
  /** Exact text being selected */
  exact: string;
  /** Text appearing before the selection */
  prefix?: string;
  /** Text appearing after the selection */
  suffix?: string;
}

/**
 * Text position selector (character offsets).
 */
export interface TextPositionSelector {
  type: "TextPositionSelector";
  /** Starting character offset */
  start: number;
  /** Ending character offset */
  end: number;
}

/**
 * Fragment selector (for heading IDs, etc.).
 */
export interface FragmentSelector {
  type: "FragmentSelector";
  /** Fragment identifier */
  value: string;
}

/**
 * Union type for all selector types.
 */
export type AnnotationSelector =
  | TextQuoteSelector
  | TextPositionSelector
  | FragmentSelector;

/**
 * Target of an annotation.
 */
export interface AnnotationTarget {
  /** Source file being annotated */
  source: string;
  /** Selector identifying the specific target */
  selector: AnnotationSelector;
}

/**
 * Body/content of an annotation.
 */
export interface AnnotationBody {
  /** Body type */
  type: "TextualBody";
  /** The annotation text */
  value: string;
  /** Format of the value */
  format: "text/plain" | "text/markdown" | "text/html";
}

/**
 * A reply to an annotation.
 */
export interface AnnotationReply {
  /** Unique reply ID */
  id: string;
  /** ISO 8601 creation timestamp */
  created: string;
  /** Reply author */
  creator: Author;
  /** Reply body */
  body: AnnotationBody;
}

/**
 * Represents a document annotation.
 * Compatible with W3C Web Annotation Data Model.
 */
export interface Annotation {
  /** Unique annotation ID */
  id: string;
  /** Type: "Annotation" (W3C standard) */
  type: "Annotation";
  /** Motivation/purpose of the annotation */
  motivation: AnnotationType | string;
  /** ISO 8601 creation timestamp */
  created: string;
  /** ISO 8601 modification timestamp */
  modified?: string;
  /** Annotation creator */
  creator: Author;
  /** Target of the annotation */
  target: AnnotationTarget;
  /** Body/content of the annotation */
  body: AnnotationBody;
  /** MDX-specific status */
  "mdx:status"?: AnnotationStatus | string;
  /** Replies to this annotation */
  "mdx:replies"?: AnnotationReply[];
  /** Tags */
  tags?: string[];
}

/**
 * Annotations file structure.
 */
export interface AnnotationsFile {
  /** Schema version */
  schema_version: string;
  /** JSON-LD context (W3C Web Annotation) */
  "@context"?: string;
  /** List of annotations */
  annotations: Annotation[];
}

// ============================================================================
// Type Definitions - Manifest
// ============================================================================

/**
 * License information.
 */
export interface LicenseInfo {
  /** License identifier (e.g., "CC-BY-4.0", "MIT") */
  type: string;
  /** URL to license text */
  url?: string;
}

/**
 * Document metadata section of the manifest.
 */
export interface DocumentInfo {
  /** Unique document identifier (UUID v4) */
  id: string;
  /** Document title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Brief description */
  description?: string;
  /** List of authors */
  authors?: Author[];
  /** List of contributors */
  contributors?: Author[];
  /** ISO 8601 creation timestamp */
  created: string;
  /** ISO 8601 modification timestamp */
  modified: string;
  /** ISO 8601 publication timestamp */
  published?: string;
  /** Document version (SemVer) */
  version?: string;
  /** Primary language (BCP 47) */
  language?: string;
  /** License information */
  license?: LicenseInfo | string;
  /** Copyright notice */
  copyright?: string;
  /** Keywords/tags */
  keywords?: string[];
  /** Document category */
  category?: string;
  /** Document subject */
  subject?: string;
  /** Path to cover image */
  cover_image?: string;

  // --------------------------------------------------------------------------
  // v2.0 additions (§1.1) — all OPTIONAL, backward-compatible
  // --------------------------------------------------------------------------

  /** Content-addressed identifier of the document (v2.0 §9.4). Format: `<algo>:<hex>`. */
  content_id?: string;
  /** Document profile URI for machine-checkable structural validation (v2.0 §13). */
  profile?: string;
  /** Source documents this was derived from (v2.0 §15.2). */
  derived_from?: DerivedFromEntry[];
  /** Document-level accessibility metadata (v2.0 §14.2). */
  accessibility?: DocumentAccessibility;
}

// ============================================================================
// v2.0 — Derived-from / Provenance (§15)
// ============================================================================

/**
 * A single upstream source for a v2.0 document's provenance chain.
 */
export interface DerivedFromEntry {
  /** Source document identifier (URN, URL, or UUID) */
  id: string;
  /** Optional: specific version of the source */
  version?: string;
  /** Relationship to this document */
  relation: "fork" | "merge-source" | "translation-of" | "derivative-work";
  /** Optional explanatory notes */
  notes?: string;
}

// ============================================================================
// v2.0 — Accessibility (§14)
// ============================================================================

/**
 * EPUB-aligned accessibility feature enumeration (v2.0 §14.2).
 */
export type AccessibilityFeature =
  | "captions"
  | "audio-description"
  | "sign-language"
  | "long-description"
  | "mathml"
  | "structural-navigation"
  | "display-transformability"
  | "transcript"
  | "sonification"
  | "tactile-alternative"
  | "reading-order"
  | "synchronized-audio-text";

/**
 * Document-level accessibility metadata (v2.0 §14.2).
 */
export interface DocumentAccessibility {
  /** Human-readable accessibility summary */
  summary?: string;
  /** Reading level hint (e.g., "grade-6", "grade-11", "expert") */
  reading_level?: string;
  /** Content warnings (violence, medical imagery, etc.) */
  content_warnings?: string[];
  /** Declared accessibility features */
  features?: AccessibilityFeature[];
  /** Known hazards (flashing, motion simulation, sound) */
  hazards?: Array<"flashing" | "motion-simulation" | "sound" | "none" | "unknown">;
  /** Compliance claims (e.g., "WCAG-2.2-AA") */
  api_compliance?: string[];
}

/**
 * Per-asset accessibility metadata (v2.0 §14.3).
 */
export interface AssetAccessibility {
  /** Inline long description (Markdown) */
  long_description?: string;
  /** Path to external long-description file */
  long_description_path?: string;
  /** Path to audio description track (MP3/WebM) */
  audio_description_track?: string;
  /** Path to sign-language interpretation video */
  sign_language_track?: string;
  /** Path to extended-description VTT */
  extended_descriptions?: string;
  /** Path to text transcript */
  transcript?: string;
  /** MathML fallback representation */
  mathml?: string;
  /** Path to audio sonification of data */
  sonification?: string;
  /** Path to tactile/braille alternative */
  tactile_alternative?: string;
}

// ============================================================================
// v2.0 — Asset Variants and Locale Alternatives (§17, §8)
// ============================================================================

/**
 * Per-asset variant for responsive delivery (v2.0 §17.2).
 */
export interface AssetVariant {
  /** Archive-relative path to this variant's file */
  path: string;
  /** Override MIME type (useful for format alternatives) */
  mime_type?: string;
  /** Content hash for this variant */
  content_hash?: string;
  /** File size in bytes */
  size_bytes?: number;
  /** Pixel dimensions */
  width?: number;
  height?: number;
  /** Display density (e.g., "1x", "2x", "3x") */
  density?: string;
  /** Format tokens this variant serves (e.g., ["avif"], ["webp"]) */
  formats?: string[];
  /** CSS-media-query-like conditions */
  media_conditions?: string;
}

/**
 * Per-asset locale alternative (v2.0 §8.3).
 */
export interface AssetLocaleAlternative {
  /** BCP 47 language tag */
  tag: string;
  /** Archive-relative path to the localized asset */
  path: string;
  /** Localized alt-text (for images) */
  alt_text?: string;
}

// ============================================================================
// v2.0 — Content locales, variants, includes (§8, §12, §17)
// ============================================================================

/**
 * One entry in a `content.locales.available[]` array (v2.0 §8.2).
 */
export interface LocaleAvailable {
  /** BCP 47 language tag */
  tag: string;
  /** Path to this locale's primary markdown file */
  entry_point: string;
  /** Localized document title */
  title?: string;
  /** Localized cover image path */
  cover_image?: string;
}

/**
 * Multi-locale content bundle (v2.0 §8.2).
 */
export interface ContentLocales {
  /** BCP 47 tag of the default locale */
  default: string;
  /** One entry per supported locale */
  available: LocaleAvailable[];
  /** Ordered fallback chain when no exact match found */
  fallback?: string[];
}

/**
 * Document-level variant (v2.0 §17.3).
 */
export interface ContentVariant {
  /** Variant identifier (e.g., "short", "technical") */
  id: string;
  /** Path to this variant's primary markdown */
  entry_point: string;
  /** Intended audience (e.g., "executive-summary", "specialist") */
  audience?: string;
  /** Variant title */
  title?: string;
  /** Variant description */
  description?: string;
}

/**
 * Declared transclusion target (v2.0 §12.3).
 */
export interface ContentInclude {
  /** Local identifier for this include */
  id: string;
  /** Archive-relative path, mdx:// URI, or https:// URL */
  target: string;
  /** Content hash pinning for external targets */
  content_hash?: string;
  /** Whether this include is considered trusted (default false) */
  trusted?: boolean;
}

/**
 * Additional content file reference.
 */
export interface AdditionalFile {
  /** Path to the file */
  path: string;
  /** Human-readable title */
  title?: string;
}

/**
 * Content configuration section.
 */
export interface ContentConfig {
  /** Path to main Markdown file */
  entry_point: string;
  /** Character encoding */
  encoding?: string;
  /** Markdown variant (e.g., "CommonMark", "GFM") */
  markdown_variant?: string;
  /** Markdown specification version */
  markdown_version?: string;
  /** Enabled Markdown extensions */
  extensions?: string[];
  /** Additional content files */
  additional_files?: AdditionalFile[];

  // --------------------------------------------------------------------------
  // v2.0 additions
  // --------------------------------------------------------------------------

  /** Transclusion targets declared up-front for prefetching (v2.0 §12.3) */
  includes?: ContentInclude[];
  /** Multi-locale content bundle (v2.0 §8) */
  locales?: ContentLocales;
  /** Document-level variants (v2.0 §17.3) */
  variants?: ContentVariant[];
}

/**
 * Assets inventory section.
 */
export interface AssetsInventory {
  images?: ImageAssetMetadata[];
  video?: VideoAssetMetadata[];
  audio?: AudioAssetMetadata[];
  models?: ModelAssetMetadata[];
  documents?: DocumentAssetMetadata[];
  data?: DataAssetMetadata[];
  fonts?: FontAssetMetadata[];
  other?: BaseAssetMetadata[];
}

/**
 * Custom CSS properties.
 */
export interface CustomCSSProperties {
  [key: string]: string;
}

/**
 * Alignment class definitions (v1.1).
 * Maps class names to CSS style declarations.
 */
export interface AlignmentClasses {
  /** CSS for left alignment */
  "align-left"?: string;
  /** CSS for center alignment */
  "align-center"?: string;
  /** CSS for right alignment */
  "align-right"?: string;
  /** CSS for justify alignment */
  "align-justify"?: string;
  /** Allow additional custom alignment classes */
  [key: string]: string | undefined;
}

/**
 * Styles configuration section.
 */
export interface StylesConfig {
  /** Path to main theme CSS */
  theme?: string;
  /** Path to print-specific CSS */
  print?: string;
  /** Syntax highlighting theme name */
  syntax_highlighting?: string;
  /** Custom CSS properties */
  custom_properties?: CustomCSSProperties;
  /** Alignment class definitions (v1.1) */
  alignment_classes?: AlignmentClasses;
}

/**
 * Math delimiter configuration.
 */
export interface MathDelimiters {
  /** Inline math delimiters */
  inline: [string, string];
  /** Block math delimiters */
  block: [string, string];
}

/**
 * Table of contents configuration.
 */
export interface TOCConfig {
  /** Whether TOC is enabled */
  enabled: boolean;
  /** Maximum heading depth to include */
  depth?: number;
  /** Whether to use ordered list */
  ordered?: boolean;
}

/**
 * Line numbers configuration.
 */
export interface LineNumbersConfig {
  /** Whether line numbers are enabled */
  enabled: boolean;
  /** Starting line number */
  start?: number;
}

/**
 * Footnotes configuration.
 */
export interface FootnotesConfig {
  /** Where to place footnotes */
  style: "end-of-document" | "end-of-section" | "inline";
}

/**
 * Attributes configuration (v1.1).
 * Controls block attribute and alignment parsing behavior.
 */
export interface AttributesConfig {
  /** Whether attribute parsing is enabled */
  enabled?: boolean;
  /** Whether inline styles are allowed in attributes */
  allow_inline_styles?: boolean;
}

/**
 * Rendering configuration section.
 */
export interface RenderingConfig {
  /** Math renderer to use */
  math_renderer?: "katex" | "mathjax" | "none";
  /** Math delimiters */
  math_delimiters?: MathDelimiters;
  /** Table of contents settings */
  table_of_contents?: TOCConfig;
  /** Line numbers for code blocks */
  line_numbers?: LineNumbersConfig;
  /** Footnotes settings */
  footnotes?: FootnotesConfig;
  /** Attributes configuration (v1.1) */
  attributes?: AttributesConfig;
}

/**
 * Script configuration.
 */
export interface ScriptConfig {
  /** Path to the script file */
  path: string;
  /** Script type: "module" or "script" */
  type?: "module" | "script";
  /** Subresource integrity hash */
  integrity?: string;
  /** Whether to sandbox the script */
  sandbox?: boolean;
  /** Permissions granted to the script */
  permissions?: string[];
  /** Loading strategy */
  load?: "eager" | "lazy";
}

/**
 * Interactivity configuration section.
 */
export interface InteractivityConfig {
  /** Interactive scripts */
  scripts?: ScriptConfig[];
  /** Required browser capabilities */
  required_capabilities?: string[];
  /** Optional browser capabilities */
  optional_capabilities?: string[];
  /** Fallback behavior when capabilities aren't available */
  fallback_behavior?:
    | "show-static-preview"
    | "show-message"
    | "hide"
    | "show-cached-output";
  /** Computational-cell kernel declarations (v2.0 §11.5) */
  kernels?: KernelSpec[];
}

/**
 * Kernel declaration for computational cells (v2.0 §11.5).
 */
export interface KernelSpec {
  /** Kernel identifier referenced by `::cell{kernel=...}` */
  id: string;
  /** Archive-relative path to the Jupyter-style kernelspec JSON */
  spec_path?: string;
  /** Language the kernel runs */
  language: string;
  /** Language version */
  version?: string;
  /** Package/library requirements for re-execution */
  requirements?: string[];
}

/**
 * Collaboration configuration section.
 */
export interface CollaborationConfig {
  /** Whether annotations are allowed */
  allow_annotations?: boolean;
  /** Allowed annotation types */
  annotation_types?: AnnotationType[];
  /** Whether to track changes */
  track_changes?: boolean;
  /** Whether replies are allowed */
  allow_replies?: boolean;
}

/**
 * History configuration section.
 */
export interface HistoryConfig {
  /** Whether history tracking is enabled */
  enabled?: boolean;
  /** Path to versions.json file */
  versions_file?: string;
  /** Path to fork/merge DAG (v2.0 §15.4) */
  graph_file?: string;
  /** Directory for snapshots */
  snapshots_directory?: string;
  /** Retention policy */
  retention_policy?: "all" | "major" | "recent";
  /** Diff format */
  diff_format?: "unified" | "context";
}

/**
 * Integrity configuration.
 */
export interface IntegrityConfig {
  /** Hash algorithm */
  algorithm: string;
  /** Checksum of the manifest itself */
  manifest_checksum?: string;
}

/**
 * Signature configuration.
 */
export interface SignatureConfig {
  /** Signer identifier */
  signed_by?: string;
  /** Signature algorithm */
  algorithm?: string;
  /** Certificate */
  certificate?: string;
  /** Signature value */
  signature?: string;
}

/**
 * Permissions configuration.
 */
export interface PermissionsConfig {
  /** Allow external link navigation */
  allow_external_links?: boolean;
  /** Allow loading external images */
  allow_external_images?: boolean;
  /** Allow external `::include` targets (v2.0 §12.4) */
  allow_external_includes?: boolean;
  /** Allow script execution */
  allow_scripts?: boolean;
  /** Allow computational-cell kernel execution (v2.0 §11.6) */
  allow_kernels?: boolean;
  /** Script sandbox level */
  script_sandbox?: "strict" | "relaxed" | "none";
}

/**
 * Security configuration section.
 */
export interface SecurityConfig {
  /** Integrity verification */
  integrity?: IntegrityConfig;
  /**
   * Digital signature (v1.1 singular form).
   * DEPRECATED in v2.0 — use `signatures[]`. Still accepted by readers.
   */
  signature?: SignatureConfig;
  /** Multi-signature chain (v2.0 §16.2) */
  signatures?: SignatureEntry[];
  /** Permissions */
  permissions?: PermissionsConfig;
}

// ============================================================================
// v2.0 — Multi-signature + DID identity (§16)
// ============================================================================

/**
 * Identity of a signer, optionally including a W3C Decentralized Identifier.
 */
export interface SignerIdentity {
  name: string;
  email?: string;
  url?: string;
  /** W3C DID per did-core (v2.0 §16.4) */
  did?: string;
  /** Specific key identifier within the DID document */
  key_id?: string;
}

/**
 * Built-in signer roles from the v2.0 spec (§16.2).
 *
 * Custom roles are supported via `CustomSignerRole` — a branded string
 * type that prevents accidental mixing of typos with built-in roles
 * while still allowing callers to opt in to a URI or application-
 * specific value explicitly.
 */
export type BuiltInSignerRole =
  | "author"
  | "reviewer"
  | "editor"
  | "publisher"
  | "notary";

/**
 * A custom signer role (e.g., a URI or application-defined identifier).
 * Construct via `customSignerRole(...)`.
 */
export type CustomSignerRole = string & { readonly __customSignerRole: unique symbol };

/**
 * Opt-in constructor for a custom signer role. Making this explicit
 * prevents the `| string` erase-the-union foot-gun: callers must decide
 * "yes, this is a non-standard role" rather than getting it for free
 * from literal string inference.
 */
export function customSignerRole(value: string): CustomSignerRole {
  return value as CustomSignerRole;
}

export type SignerRole = BuiltInSignerRole | CustomSignerRole;

/**
 * One entry in v2.0's `security.signatures[]` (v2.0 §16.2).
 */
export interface SignatureEntry {
  /** Role of this signer — one of the built-in roles or an explicit `customSignerRole(...)`. */
  role: SignerRole;
  /** Signer identity */
  signer: SignerIdentity;
  /** Signature algorithm */
  algorithm: "Ed25519" | "RS256" | "ES256";
  /** What the signature covers */
  scope?: "manifest-only" | "manifest-and-content" | "full-archive";
  /** Canonicalization method for the signed data */
  canonicalization?: "jcs";
  /** When the signature was made (ISO 8601) */
  timestamp?: string;
  /** Base64 signature bytes */
  signature: string;
  /** Optional certificate chain */
  certificate?: string;
  /** Hash of the previous signature entry (signature chaining, v2.0 §16.3) */
  prev_signature?: string;
  /** URL to check for revocation status */
  revocation_url?: string;
}

/**
 * Extension configuration.
 */
export interface ExtensionConfig {
  /** Extension version */
  version: string;
  /** Extension-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Complete MDX manifest structure.
 */
export interface MDZManifestData {
  /** JSON Schema URL (optional) */
  $schema?: string;
  /** MDX specification version */
  mdx_version: string;
  /** Document metadata */
  document: DocumentInfo;
  /** Content configuration */
  content: ContentConfig;
  /** Assets inventory */
  assets?: AssetsInventory;
  /** Styles configuration */
  styles?: StylesConfig;
  /** Rendering configuration */
  rendering?: RenderingConfig;
  /** Interactivity configuration */
  interactivity?: InteractivityConfig;
  /** Collaboration configuration */
  collaboration?: CollaborationConfig;
  /** History configuration */
  history?: HistoryConfig;
  /** Security configuration */
  security?: SecurityConfig;
  /** Extensions */
  extensions?: Record<string, ExtensionConfig>;
  /** Custom application-specific data */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a UUID v4 string.
 * @returns A new UUID v4
 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers/Node.js 19+)
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates an ISO 8601 timestamp for the current time.
 * @returns ISO 8601 formatted timestamp string
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Computes a checksum for binary data.
 * @param data - The data to hash
 * @param algorithm - Hash algorithm (default: "sha256")
 * @returns Checksum string in format "algorithm:hexdigest"
 */
export async function computeChecksum(
  data: ArrayBuffer | Uint8Array,
  algorithm: string = "SHA-256"
): Promise<string> {
  // Use Web Crypto API
  if (typeof crypto !== "undefined" && crypto.subtle) {
    // TS lib now distinguishes ArrayBuffer from SharedArrayBuffer via
    // Uint8Array<ArrayBufferLike>. crypto.subtle.digest wants a BufferSource
    // backed by a plain ArrayBuffer. Cast through BufferSource explicitly.
    const hashBuffer = await crypto.subtle.digest(algorithm, data as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${algorithm.toLowerCase().replace("-", "")}:${hashHex}`;
  }

  // Fallback: return empty checksum (Node.js without webcrypto should use crypto module)
  console.warn("Crypto API not available, skipping checksum");
  return "";
}

/**
 * Gets the file extension from a path or filename.
 * @param filepath - The file path or name
 * @returns The extension including the dot (e.g., ".png"), or empty string
 */
export function getExtension(filepath: string): string {
  const lastDot = filepath.lastIndexOf(".");
  const lastSlash = Math.max(filepath.lastIndexOf("/"), filepath.lastIndexOf("\\"));

  if (lastDot > lastSlash && lastDot !== -1) {
    return filepath.slice(lastDot).toLowerCase();
  }
  return "";
}

/**
 * Gets the filename from a path.
 * @param filepath - The file path
 * @returns The filename component
 */
export function getFilename(filepath: string): string {
  const lastSlash = Math.max(filepath.lastIndexOf("/"), filepath.lastIndexOf("\\"));
  return lastSlash === -1 ? filepath : filepath.slice(lastSlash + 1);
}

/**
 * Determines the MIME type from a file extension.
 * @param filepath - The file path or name
 * @returns The MIME type string
 */
export function getMimeType(filepath: string): string {
  const ext = getExtension(filepath);
  return EXTENSION_TO_MIME[ext] || "application/octet-stream";
}

/**
 * Determines the asset category from a file extension.
 * @param filepath - The file path or name
 * @returns The asset category, or undefined if not recognized
 */
export function getAssetCategory(filepath: string): AssetCategory | undefined {
  const ext = getExtension(filepath);
  return EXTENSION_TO_CATEGORY[ext];
}

/**
 * Sanitizes a path for use inside the archive.
 * @param path - The path to sanitize
 * @returns The sanitized path
 */
export function sanitizePath(path: string): string {
  // Replace backslashes with forward slashes
  let sanitized = path.replace(/\\/g, "/");

  // Remove leading slashes
  sanitized = sanitized.replace(/^\/+/, "");

  // Remove path traversal attempts and empty segments
  const parts = sanitized.split("/").filter((p) => p && p !== ".." && p !== ".");

  return parts.join("/");
}

/**
 * Plain-object-only constraint — excludes arrays, Maps, Sets, and
 * Dates at the type level. These collection types would otherwise be
 * accepted under `T extends object` and silently iterated by
 * `Object.entries`, producing nonsense (indexed keys for arrays, empty
 * result for Maps). Interfaces without a string index signature still
 * satisfy this bound, so `cleanObject(author)` continues to type-check
 * without the caller having to widen to `Record<string, unknown>`.
 */
type PlainObject<T> = T extends ReadonlyArray<unknown>
  ? never
  : T extends Map<unknown, unknown>
  ? never
  : T extends Set<unknown>
  ? never
  : T extends Date
  ? never
  : T;

/**
 * Removes undefined and null values from a plain object.
 *
 * @param obj - The plain object to clean
 * @returns A new object with only defined values (same shape as input)
 */
export function cleanObject<T extends object>(obj: PlainObject<T>): Partial<T> {
  // Runtime guard: if TS's type-level exclusions are bypassed via `any`,
  // fail fast rather than producing a silently-wrong result.
  if (Array.isArray(obj) || obj instanceof Map || obj instanceof Set || obj instanceof Date) {
    throw new TypeError(
      `cleanObject expects a plain object, got ${obj.constructor?.name ?? typeof obj}`,
    );
  }
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

// ============================================================================
// MDZManifest Class
// ============================================================================

/**
 * Manages the MDX document manifest.
 *
 * The manifest contains all metadata about the document, including
 * document info, asset inventory, rendering preferences, and more.
 *
 * @example
 * ```typescript
 * const manifest = new MDZManifest();
 * manifest.title = "My Document";
 * manifest.addAuthor({ name: "John Doe", email: "john@example.com" });
 * ```
 */
export class MDZManifest {
  private _data: MDZManifestData;

  /**
   * Creates a new MDZManifest instance.
   * @param data - Optional initial manifest data
   */
  constructor(data?: Partial<MDZManifestData>) {
    const now = isoTimestamp();
    this._data = {
      mdx_version: MDX_VERSION,
      document: {
        id: generateUUID(),
        title: "Untitled Document",
        created: now,
        modified: now,
      },
      content: {
        entry_point: "document.md",
        encoding: "UTF-8",
        markdown_variant: "CommonMark",
      },
      assets: {
        images: [],
        video: [],
        audio: [],
        models: [],
        documents: [],
        data: [],
        fonts: [],
        other: [],
      },
      ...data,
    };
  }

  /**
   * Creates a manifest from a plain object.
   * @param data - The manifest data object
   * @returns A new MDZManifest instance
   */
  static fromObject(data: MDZManifestData): MDZManifest {
    const manifest = new MDZManifest();
    manifest._data = data;
    return manifest;
  }

  /**
   * Creates a manifest from a JSON string.
   * @param json - The JSON string
   * @returns A new MDZManifest instance
   */
  static fromJSON(json: string): MDZManifest {
    return MDZManifest.fromObject(JSON.parse(json));
  }

  /**
   * Converts the manifest to a plain object.
   * @returns The manifest data object
   */
  toObject(): MDZManifestData {
    return this._data;
  }

  /**
   * Converts the manifest to a JSON string.
   * @param indent - Number of spaces for indentation (default: 2)
   * @returns JSON string
   */
  toJSON(indent: number = 2): string {
    return JSON.stringify(this._data, null, indent);
  }

  // --------------------------------------------------------------------------
  // Document Properties
  // --------------------------------------------------------------------------

  /** The unique document identifier */
  get documentId(): string {
    return this._data.document.id;
  }

  /** The document title */
  get title(): string {
    return this._data.document.title;
  }

  set title(value: string) {
    this._data.document.title = value;
    this.updateModified();
  }

  /** The document subtitle */
  get subtitle(): string | undefined {
    return this._data.document.subtitle;
  }

  set subtitle(value: string | undefined) {
    this._data.document.subtitle = value;
    this.updateModified();
  }

  /** The document description */
  get description(): string | undefined {
    return this._data.document.description;
  }

  set description(value: string | undefined) {
    this._data.document.description = value;
    this.updateModified();
  }

  /** The document authors */
  get authors(): Author[] {
    return this._data.document.authors || [];
  }

  /** The document version */
  get version(): string {
    return this._data.document.version || "1.0.0";
  }

  set version(value: string) {
    this._data.document.version = value;
    this.updateModified();
  }

  /** The document creation timestamp */
  get created(): string {
    return this._data.document.created;
  }

  /** The document modification timestamp */
  get modified(): string {
    return this._data.document.modified;
  }

  /** The primary document language */
  get language(): string | undefined {
    return this._data.document.language;
  }

  set language(value: string | undefined) {
    this._data.document.language = value;
    this.updateModified();
  }

  /** The content entry point path */
  get entryPoint(): string {
    return this._data.content.entry_point;
  }

  set entryPoint(value: string) {
    this._data.content.entry_point = value;
    this.updateModified();
  }

  // --------------------------------------------------------------------------
  // Internal Methods
  // --------------------------------------------------------------------------

  /**
   * Updates the modified timestamp to the current time.
   */
  private updateModified(): void {
    this._data.document.modified = isoTimestamp();
  }

  // --------------------------------------------------------------------------
  // Author Management
  // --------------------------------------------------------------------------

  /**
   * Adds an author to the document.
   * @param author - The author to add
   */
  addAuthor(author: Author): void {
    if (!this._data.document.authors) {
      this._data.document.authors = [];
    }
    this._data.document.authors.push(cleanObject(author) as Author);
    this.updateModified();
  }

  /**
   * Adds a contributor to the document.
   * @param contributor - The contributor to add
   */
  addContributor(contributor: Author): void {
    if (!this._data.document.contributors) {
      this._data.document.contributors = [];
    }
    this._data.document.contributors.push(cleanObject(contributor) as Author);
    this.updateModified();
  }

  // --------------------------------------------------------------------------
  // Asset Management
  // --------------------------------------------------------------------------

  /**
   * Adds an asset to the manifest inventory.
   * @param metadata - The asset metadata
   * @param category - The asset category
   */
  addAsset(metadata: AssetMetadata, category: AssetCategory): void {
    if (!this._data.assets) {
      this._data.assets = {};
    }

    const categoryKey = category as keyof AssetsInventory;
    if (!this._data.assets[categoryKey]) {
      this._data.assets[categoryKey] = [];
    }

    // Type assertion needed due to union type complexity
    (this._data.assets[categoryKey] as AssetMetadata[]).push(
      cleanObject(metadata) as AssetMetadata,
    );
    this.updateModified();
  }

  /**
   * Gets assets, optionally filtered by category.
   * @param category - Optional category filter
   * @returns Array of asset metadata
   */
  getAssets(category?: AssetCategory): AssetMetadata[] {
    if (!this._data.assets) {
      return [];
    }

    if (category) {
      const categoryKey = category as keyof AssetsInventory;
      return (this._data.assets[categoryKey] as AssetMetadata[]) || [];
    }

    // Return all assets
    const allAssets: AssetMetadata[] = [];
    for (const categoryAssets of Object.values(this._data.assets)) {
      if (Array.isArray(categoryAssets)) {
        allAssets.push(...categoryAssets);
      }
    }
    return allAssets;
  }

  /**
   * Finds an asset by its path.
   * @param path - The asset path
   * @returns The asset metadata, or undefined if not found
   */
  findAsset(path: string): AssetMetadata | undefined {
    return this.getAssets().find((asset) => asset.path === path);
  }

  /**
   * Updates an existing asset's metadata.
   * @param path - The asset path
   * @param updates - The metadata updates
   * @returns True if the asset was found and updated
   */
  updateAsset(path: string, updates: Partial<AssetMetadata>): boolean {
    if (!this._data.assets) return false;

    for (const categoryAssets of Object.values(this._data.assets)) {
      if (Array.isArray(categoryAssets)) {
        const asset = categoryAssets.find((a) => a.path === path);
        if (asset) {
          Object.assign(asset, cleanObject(updates as Record<string, unknown>));
          this.updateModified();
          return true;
        }
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Configuration Methods
  // --------------------------------------------------------------------------

  /**
   * Sets rendering options.
   * @param options - The rendering options to set
   */
  setRenderingOptions(options: Partial<RenderingConfig>): void {
    if (!this._data.rendering) {
      this._data.rendering = {};
    }
    Object.assign(this._data.rendering, cleanObject(options as Record<string, unknown>));
    this.updateModified();
  }

  /**
   * Sets styles configuration.
   * @param options - The styles options to set
   */
  setStylesOptions(options: Partial<StylesConfig>): void {
    if (!this._data.styles) {
      this._data.styles = {};
    }
    Object.assign(this._data.styles, cleanObject(options as Record<string, unknown>));
    this.updateModified();
  }

  /**
   * Enables collaboration features.
   * @param options - Collaboration options
   */
  enableCollaboration(options: Partial<CollaborationConfig> = {}): void {
    this._data.collaboration = {
      allow_annotations: true,
      track_changes: true,
      allow_replies: true,
      ...options,
    };
    this.updateModified();
  }

  /**
   * Enables version history tracking.
   * @param options - History options
   */
  enableHistory(options: Partial<HistoryConfig> = {}): void {
    this._data.history = {
      enabled: true,
      versions_file: "history/versions.json",
      snapshots_directory: "history/snapshots",
      retention_policy: "all",
      ...options,
    };
    this.updateModified();
  }

  /**
   * Sets custom application-specific data.
   * @param key - The data key
   * @param value - The data value
   */
  setCustomData(key: string, value: unknown): void {
    if (!this._data.custom) {
      this._data.custom = {};
    }
    this._data.custom[key] = value;
    this.updateModified();
  }

  /**
   * Gets custom application-specific data.
   * @param key - The data key
   * @returns The data value, or undefined
   */
  getCustomData<T = unknown>(key: string): T | undefined {
    return this._data.custom?.[key] as T | undefined;
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validates the manifest structure.
   *
   * Structural invariants enforced here that JSON Schema cannot express:
   *
   * 1. `content.locales.default` must be one of the tags in
   *    `content.locales.available[]` — otherwise the default points
   *    at a locale that doesn't exist.
   * 2. `security.signature` (legacy v1.1 singular) and
   *    `security.signatures` (v2.0 multi) are mutually exclusive —
   *    writers must pick one to avoid ambiguity about which is
   *    authoritative.
   * 3. Signature chain: after the first entry, every
   *    `security.signatures[i]` with `i > 0` must set
   *    `prev_signature` so verifiers can detect insertion/removal of
   *    middle entries.
   *
   * @returns Array of validation error messages (empty if valid)
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this._data.mdx_version) {
      errors.push("Missing required field: mdx_version");
    }

    if (!this._data.document) {
      errors.push("Missing required field: document");
    } else {
      const doc = this._data.document;
      if (!doc.id) errors.push("Missing required document field: id");
      if (!doc.title) errors.push("Missing required document field: title");
      if (!doc.created) errors.push("Missing required document field: created");
      if (!doc.modified) errors.push("Missing required document field: modified");
    }

    if (!this._data.content) {
      errors.push("Missing required field: content");
    } else {
      if (!this._data.content.entry_point) {
        errors.push("Missing required content field: entry_point");
      }
      // Invariant 1: locales.default must be in available[].tag
      const locales = this._data.content.locales;
      if (locales) {
        const tags = locales.available.map((a) => a.tag);
        if (!tags.includes(locales.default)) {
          errors.push(
            `content.locales.default "${locales.default}" is not one of ` +
              `available[].tag: [${tags.join(", ")}]`,
          );
        }
        // Also flag duplicate tags — ambiguous resolution.
        const seen = new Set<string>();
        for (const tag of tags) {
          if (seen.has(tag)) {
            errors.push(`content.locales.available has duplicate tag: "${tag}"`);
          }
          seen.add(tag);
        }
      }
    }

    // Invariants 2 & 3: signature policy
    const sec = this._data.security;
    if (sec) {
      if (sec.signature && sec.signatures && sec.signatures.length > 0) {
        errors.push(
          "security.signature (v1.1 singular) and security.signatures[] " +
            "(v2.0 multi) are mutually exclusive; set only one",
        );
      }
      if (sec.signatures) {
        for (let i = 1; i < sec.signatures.length; i++) {
          if (!sec.signatures[i].prev_signature) {
            errors.push(
              `security.signatures[${i}] must set prev_signature (chain ` +
                `verification requires every non-first entry to link to the ` +
                `previous one)`,
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Checks if the manifest is valid.
   * @returns True if valid, false otherwise
   */
  isValid(): boolean {
    return this.validate().length === 0;
  }

  // ==========================================================================
  // v2.0 helpers — §8 Internationalization
  // ==========================================================================

  /**
   * Add a locale to `content.locales.available` and ensure a default exists.
   * First locale added becomes the default unless one is already set.
   */
  addLocale(locale: LocaleAvailable): void {
    if (!this._data.content.locales) {
      this._data.content.locales = {
        default: locale.tag,
        available: [],
      };
    }
    this._data.content.locales.available.push(locale);
    this.updateModified();
  }

  /** Get the list of available locale tags, or [] if none declared. */
  getLocaleTags(): string[] {
    return (this._data.content.locales?.available ?? []).map((l) => l.tag);
  }

  /**
   * Resolve the effective locale for a viewer preference (v2.0 §8.4).
   * Returns a locale entry from `available[]`, or null if none declared.
   */
  resolveLocale(preferred: string[]): LocaleAvailable | null {
    const loc = this._data.content.locales;
    if (!loc) return null;
    for (const pref of preferred) {
      const match = loc.available.find((a) => a.tag === pref);
      if (match) return match;
    }
    for (const fb of loc.fallback ?? []) {
      const match = loc.available.find((a) => a.tag === fb);
      if (match) return match;
    }
    return loc.available.find((a) => a.tag === loc.default) ?? null;
  }

  // ==========================================================================
  // v2.0 helpers — §12 Transclusion
  // ==========================================================================

  /** Register a transclusion target for prefetching (v2.0 §12.3). */
  addInclude(include: ContentInclude): void {
    if (!this._data.content.includes) this._data.content.includes = [];
    this._data.content.includes.push(include);
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §17 Document Variants
  // ==========================================================================

  /** Declare a document-level content variant (v2.0 §17.3). */
  addVariant(variant: ContentVariant): void {
    if (!this._data.content.variants) this._data.content.variants = [];
    this._data.content.variants.push(variant);
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §13 Profiles
  // ==========================================================================

  /** Set the document profile URI (v2.0 §13.2). */
  setProfile(uri: string): void {
    this._data.document.profile = uri;
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §14 Accessibility
  // ==========================================================================

  /** Set document-level accessibility metadata (v2.0 §14.2). */
  setAccessibility(a11y: DocumentAccessibility): void {
    this._data.document.accessibility = a11y;
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §15 Provenance
  // ==========================================================================

  /** Record a derived-from entry for provenance tracking (v2.0 §15.2). */
  addDerivedFrom(entry: DerivedFromEntry): void {
    if (!this._data.document.derived_from) {
      this._data.document.derived_from = [];
    }
    this._data.document.derived_from.push(entry);
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §16 Multi-Signature
  // ==========================================================================

  /**
   * Add a signature entry (v2.0 §16.2).
   *
   * Chain policy: when adding entry N > 0, the caller MUST supply
   * `entry.prev_signature` — it's the author's commitment that this
   * entry follows the previous one. Without it, a middle entry could
   * be inserted or reordered and a later chain-verifier couldn't
   * detect it. This throws at insertion time rather than deferring to
   * `validate()` because silently accepting a broken chain lets
   * authors ship documents that will fail verification downstream.
   *
   * Refusing when a legacy `security.signature` is set prevents the
   * ambiguous "both" state that `validate()` flags (invariant 2 above);
   * callers must delete the legacy field explicitly to migrate.
   */
  addSignature(entry: SignatureEntry): void {
    if (!this._data.security) this._data.security = {};
    if (this._data.security.signature) {
      throw new Error(
        "Cannot addSignature: legacy `security.signature` (v1.1 singular) is " +
          "still present. Delete it first to migrate to `signatures[]`.",
      );
    }
    if (!this._data.security.signatures) this._data.security.signatures = [];
    const existing = this._data.security.signatures;
    if (existing.length > 0 && !entry.prev_signature) {
      throw new Error(
        `addSignature: entry at index ${existing.length} requires ` +
          `prev_signature (hash of the previous entry's signature) to ` +
          `preserve chain integrity.`,
      );
    }
    existing.push(entry);
    this.updateModified();
  }

  // ==========================================================================
  // v2.0 helpers — §11 Computational Cells
  // ==========================================================================

  /** Register a kernel spec for computational cells (v2.0 §11.5). */
  addKernel(spec: KernelSpec): void {
    if (!this._data.interactivity) this._data.interactivity = {};
    if (!this._data.interactivity.kernels) this._data.interactivity.kernels = [];
    this._data.interactivity.kernels.push(spec);
    this.updateModified();
  }
}

// ============================================================================
// MDZDocument Class
// ============================================================================

/**
 * Options for creating a new MDX document.
 */
export interface CreateDocumentOptions {
  /** Author name */
  author?: string;
  /** Author email */
  authorEmail?: string;
  /** Document description */
  description?: string;
  /** Document language (BCP 47) */
  language?: string;
  /** Initial document version */
  version?: string;
}

/**
 * Options for saving an MDX document.
 */
export interface SaveOptions {
  /** Compression level (0-9, default: 6) */
  compressionLevel?: number;
  /** Whether to include checksums */
  includeChecksums?: boolean;
}

/**
 * Options for exporting to HTML.
 */
export interface HTMLExportOptions {
  /** Whether to embed assets as base64 */
  embedAssets?: boolean;
  /** Custom CSS to include */
  customCSS?: string;
  /** Whether to include a TOC */
  includeTOC?: boolean;
}

/**
 * Main class for working with MDX documents.
 *
 * This class provides a high-level API for creating, reading, and
 * manipulating MDX files.
 *
 * @example
 * ```typescript
 * // Create a new document
 * const doc = MDZDocument.create("My Report", { author: "Jane Doe" });
 * doc.setContent("# Introduction\n\nThis is my report...");
 * await doc.addImage("figure1.png", { altText: "Figure 1" });
 * await doc.save("report.mdx");
 *
 * // Open an existing document
 * const doc = await MDZDocument.open(fileData);
 * console.log(doc.content);
 * ```
 */
export class MDZDocument {
  private _manifest: MDZManifest;
  private _content: string;
  private _assets: Map<string, Uint8Array>;
  private _versions: VersionEntry[];
  private _annotations: Annotation[];

  /**
   * Creates a new MDZDocument instance.
   * This constructor is private; use static factory methods instead.
   */
  private constructor() {
    this._manifest = new MDZManifest();
    this._content = "";
    this._assets = new Map();
    this._versions = [];
    this._annotations = [];
  }

  // --------------------------------------------------------------------------
  // Static Factory Methods
  // --------------------------------------------------------------------------

  /**
   * Creates a new MDX document.
   *
   * @param title - Document title
   * @param options - Additional creation options
   * @returns A new MDZDocument instance
   *
   * @example
   * ```typescript
   * const doc = MDZDocument.create("My Document", {
   *   author: "John Doe",
   *   authorEmail: "john@example.com",
   *   description: "A sample document",
   * });
   * ```
   */
  static create(title: string, options: CreateDocumentOptions = {}): MDZDocument {
    const doc = new MDZDocument();
    doc._manifest.title = title;

    if (options.description) {
      doc._manifest.description = options.description;
    }

    if (options.language) {
      doc._manifest.language = options.language;
    }

    if (options.version) {
      doc._manifest.version = options.version;
    }

    if (options.author) {
      doc._manifest.addAuthor({
        name: options.author,
        email: options.authorEmail,
        role: "author",
      });
    }

    // Set default content
    doc._content = `# ${title}\n\n`;

    return doc;
  }

  /**
   * Opens an existing MDX file from binary data.
   *
   * @param data - The MDX file data (ArrayBuffer, Uint8Array, or Blob)
   * @returns Promise resolving to the MDZDocument
   * @throws Error if the file is not a valid MDX archive
   *
   * @example
   * ```typescript
   * // From file input
   * const file = fileInput.files[0];
   * const doc = await MDZDocument.open(file);
   *
   * // From ArrayBuffer
   * const response = await fetch("document.mdx");
   * const data = await response.arrayBuffer();
   * const doc = await MDZDocument.open(data);
   * ```
   */
  static async open(data: ArrayBuffer | Uint8Array | Blob): Promise<MDZDocument> {
    const doc = new MDZDocument();

    // Load the ZIP archive
    const zip = new JSZip();
    await zip.loadAsync(data);

    // Read and parse manifest
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      throw new Error("Invalid MDX file: missing manifest.json");
    }
    const manifestText = await manifestFile.async("text");
    doc._manifest = MDZManifest.fromJSON(manifestText);

    // Read main content
    const entryPoint = doc._manifest.entryPoint;
    const contentFile = zip.file(entryPoint);
    if (!contentFile) {
      throw new Error(`Invalid MDX file: missing ${entryPoint}`);
    }
    doc._content = await contentFile.async("text");

    // Load all other files as assets
    const promises: Promise<void>[] = [];

    zip.forEach((relativePath: string, zipEntry: JSZip.JSZipObject) => {
      if (relativePath !== "manifest.json" && relativePath !== entryPoint && !zipEntry.dir) {
        promises.push(
          (async () => {
            const data = await zipEntry.async("uint8array");
            doc._assets.set(relativePath, data);
          })()
        );
      }
    });

    await Promise.all(promises);

    // Load version history if present
    const versionsFile = zip.file("history/versions.json");
    if (versionsFile) {
      const versionsText = await versionsFile.async("text");
      const versionsData = JSON.parse(versionsText) as VersionHistory;
      doc._versions = versionsData.versions || [];
    }

    // Load annotations if present
    const annotationsFile = zip.file("annotations/annotations.json");
    if (annotationsFile) {
      const annotationsText = await annotationsFile.async("text");
      const annotationsData = JSON.parse(annotationsText) as AnnotationsFile;
      doc._annotations = annotationsData.annotations || [];
    }

    return doc;
  }

  /**
   * Opens an MDX file from a File object (browser).
   *
   * @param file - The File object
   * @returns Promise resolving to the MDZDocument
   */
  static async openFile(file: File): Promise<MDZDocument> {
    const arrayBuffer = await file.arrayBuffer();
    return MDZDocument.open(arrayBuffer);
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  /** The document title */
  get title(): string {
    return this._manifest.title;
  }

  set title(value: string) {
    this._manifest.title = value;
  }

  /** The main Markdown content */
  get content(): string {
    return this._content;
  }

  /** The document manifest */
  get manifest(): MDZManifest {
    return this._manifest;
  }

  /** The document version */
  get version(): string {
    return this._manifest.version;
  }

  /** The document ID */
  get id(): string {
    return this._manifest.documentId;
  }

  /** The document authors */
  get authors(): Author[] {
    return this._manifest.authors;
  }

  // --------------------------------------------------------------------------
  // Content Management
  // --------------------------------------------------------------------------

  /**
   * Sets the main document content.
   *
   * @param markdown - The Markdown content
   *
   * @example
   * ```typescript
   * doc.setContent(`
   * # My Document
   *
   * This is the introduction.
   *
   * ## Section 1
   *
   * Content goes here...
   * `);
   * ```
   */
  setContent(markdown: string): void {
    this._content = markdown;
  }

  /**
   * Appends content to the document.
   *
   * @param markdown - The Markdown content to append
   */
  appendContent(markdown: string): void {
    this._content += markdown;
  }

  /**
   * Gets the main document content.
   *
   * @returns The Markdown content
   */
  getContent(): string {
    return this._content;
  }

  // --------------------------------------------------------------------------
  // Asset Management
  // --------------------------------------------------------------------------

  /**
   * Adds an asset from binary data.
   *
   * @param data - The asset data
   * @param filename - The filename to use
   * @param options - Additional options
   * @returns The internal path for Markdown reference
   *
   * @example
   * ```typescript
   * const imageData = await fetch("image.png").then(r => r.arrayBuffer());
   * const path = await doc.addAssetFromData(
   *   new Uint8Array(imageData),
   *   "figure-01.png",
   *   { altText: "Figure 1: Architecture Diagram" }
   * );
   * // Use in markdown: ![Figure 1](assets/images/figure-01.png)
   * ```
   */
  async addAssetFromData(
    data: Uint8Array | ArrayBuffer,
    filename: string,
    options: AddAssetOptions = {}
  ): Promise<string> {
    const uint8Data = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Determine category
    const category = options.category || getAssetCategory(filename) || AssetCategory.OTHER;

    // Build internal path
    const targetName = options.targetName || filename;
    const internalPath = `assets/${category}/${sanitizePath(targetName)}`;

    // Store the asset data
    this._assets.set(internalPath, uint8Data);

    // Compute checksum
    const checksum = await computeChecksum(uint8Data);

    // Build metadata
    const metadata: AssetMetadata = {
      path: internalPath,
      mime_type: getMimeType(filename),
      size_bytes: uint8Data.length,
      checksum: checksum || undefined,
    };

    // Add category-specific metadata
    if (category === AssetCategory.IMAGES) {
      (metadata as ImageAssetMetadata).alt_text = options.altText;
      (metadata as ImageAssetMetadata).title = options.title;
      (metadata as ImageAssetMetadata).credit = options.credit;
    }

    // Add any additional metadata from options
    for (const [key, value] of Object.entries(options)) {
      if (
        !["targetName", "altText", "title", "credit", "category", "description"].includes(
          key
        ) &&
        value !== undefined
      ) {
        (metadata as unknown as Record<string, unknown>)[key] = value;
      }
    }

    if (options.description) {
      metadata.description = options.description;
    }

    // Add to manifest
    this._manifest.addAsset(metadata, category);

    return internalPath;
  }

  /**
   * Adds an asset from a File object (browser).
   *
   * @param file - The File object
   * @param options - Additional options
   * @returns The internal path for Markdown reference
   */
  async addAssetFromFile(file: File, options: AddAssetOptions = {}): Promise<string> {
    const data = await file.arrayBuffer();
    return this.addAssetFromData(new Uint8Array(data), file.name, options);
  }

  /**
   * Convenience method for adding an image.
   *
   * @param data - Image data
   * @param filename - Image filename
   * @param options - Image options
   * @returns The internal path
   */
  async addImage(
    data: Uint8Array | ArrayBuffer,
    filename: string,
    options: {
      altText?: string;
      title?: string;
      credit?: string;
      width?: number;
      height?: number;
    } = {}
  ): Promise<string> {
    return this.addAssetFromData(data, filename, {
      ...options,
      category: AssetCategory.IMAGES,
    });
  }

  /**
   * Convenience method for adding a video.
   *
   * @param data - Video data
   * @param filename - Video filename
   * @param options - Video options
   * @returns The internal path
   */
  async addVideo(
    data: Uint8Array | ArrayBuffer,
    filename: string,
    options: {
      poster?: string;
      durationSeconds?: number;
      width?: number;
      height?: number;
    } = {}
  ): Promise<string> {
    return this.addAssetFromData(data, filename, {
      ...options,
      category: AssetCategory.VIDEO,
    });
  }

  /**
   * Convenience method for adding a 3D model.
   *
   * @param data - Model data
   * @param filename - Model filename
   * @param options - Model options
   * @returns The internal path
   */
  async add3DModel(
    data: Uint8Array | ArrayBuffer,
    filename: string,
    options: {
      preview?: string;
      formatVersion?: string;
    } = {}
  ): Promise<string> {
    return this.addAssetFromData(data, filename, {
      ...options,
      category: AssetCategory.MODELS,
    });
  }

  /**
   * Convenience method for adding a data file.
   *
   * @param data - Data file content
   * @param filename - Data filename
   * @param options - Data options
   * @returns The internal path
   */
  async addData(
    data: Uint8Array | ArrayBuffer | string,
    filename: string,
    options: {
      rows?: number;
      columns?: number;
      hasHeader?: boolean;
    } = {}
  ): Promise<string> {
    const uint8Data =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    return this.addAssetFromData(
      uint8Data instanceof ArrayBuffer ? new Uint8Array(uint8Data) : uint8Data,
      filename,
      {
        ...options,
        category: AssetCategory.DATA,
      }
    );
  }

  /**
   * Gets asset data by internal path.
   *
   * @param path - The internal path
   * @returns The asset data, or undefined if not found
   */
  getAsset(path: string): Uint8Array | undefined {
    return this._assets.get(path);
  }

  /**
   * Gets asset data as a string (for text-based assets).
   *
   * @param path - The internal path
   * @returns The asset content as string, or undefined
   */
  getAssetAsString(path: string): string | undefined {
    const data = this._assets.get(path);
    if (data) {
      return new TextDecoder().decode(data);
    }
    return undefined;
  }

  /**
   * Gets asset data as a Blob (for use in browsers).
   *
   * @param path - The internal path
   * @returns A Blob, or undefined if not found
   */
  getAssetAsBlob(path: string): Blob | undefined {
    const data = this._assets.get(path);
    if (data) {
      const mimeType = getMimeType(path);
      return new Blob([data as BlobPart], { type: mimeType });
    }
    return undefined;
  }

  /**
   * Gets a URL for an asset (creates an object URL).
   * Remember to revoke the URL when done using URL.revokeObjectURL().
   *
   * @param path - The internal path
   * @returns An object URL, or undefined if not found
   */
  getAssetURL(path: string): string | undefined {
    const blob = this.getAssetAsBlob(path);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return undefined;
  }

  /**
   * Lists all asset paths in the document.
   *
   * @param category - Optional category filter
   * @returns Array of internal paths
   */
  listAssets(category?: AssetCategory): string[] {
    if (category) {
      const prefix = `assets/${category}/`;
      return Array.from(this._assets.keys()).filter((p) => p.startsWith(prefix));
    }
    return Array.from(this._assets.keys());
  }

  /**
   * Checks if an asset exists.
   *
   * @param path - The internal path
   * @returns True if the asset exists
   */
  hasAsset(path: string): boolean {
    return this._assets.has(path);
  }

  /**
   * Removes an asset from the document.
   *
   * @param path - The internal path
   * @returns True if the asset was removed
   */
  removeAsset(path: string): boolean {
    // Note: This removes the data but doesn't update the manifest
    // A more complete implementation would also update the manifest
    return this._assets.delete(path);
  }

  // --------------------------------------------------------------------------
  // Version History
  // --------------------------------------------------------------------------

  /**
   * Creates a new version snapshot.
   *
   * @param version - Version string (SemVer recommended)
   * @param message - Version message/description
   * @param author - Author of this version
   * @param changes - Optional change summary
   *
   * @example
   * ```typescript
   * doc.createVersion("1.1.0", "Added new section on deployment", {
   *   name: "John Doe",
   *   email: "john@example.com",
   * }, {
   *   summary: "Added deployment documentation",
   *   added: ["Section 5: Deployment"],
   *   modified: ["README.md"],
   * });
   * ```
   */
  createVersion(
    version: string,
    message: string,
    author: Author,
    changes?: VersionChanges
  ): void {
    // Enable history if not already enabled
    if (!this._manifest.toObject().history?.enabled) {
      this._manifest.enableHistory();
    }

    // Store current content as snapshot
    const snapshotPath = `history/snapshots/v${version}.md`;
    this._assets.set(snapshotPath, new TextEncoder().encode(this._content));

    // Determine parent version
    const parentVersion =
      this._versions.length > 0
        ? this._versions[this._versions.length - 1].version
        : null;

    // Create version entry
    const entry: VersionEntry = {
      version,
      timestamp: isoTimestamp(),
      author: cleanObject(author) as Author,
      message,
      snapshot: {
        type: SnapshotType.FULL,
        path: snapshotPath,
      },
      parent_version: parentVersion,
      changes,
    };

    this._versions.push(entry);
    this._manifest.version = version;
  }

  /**
   * Gets the version history.
   *
   * @returns Array of version entries
   */
  getVersionHistory(): VersionEntry[] {
    return [...this._versions];
  }

  /**
   * Gets content from a specific version.
   *
   * @param version - The version to retrieve
   * @returns The content, or undefined if not found
   */
  getVersionContent(version: string): string | undefined {
    const entry = this._versions.find((v) => v.version === version);
    if (entry?.snapshot?.path) {
      return this.getAssetAsString(entry.snapshot.path);
    }
    return undefined;
  }

  /**
   * Restores the document to a specific version.
   *
   * @param version - The version to restore
   * @returns True if successful
   */
  restoreVersion(version: string): boolean {
    const content = this.getVersionContent(version);
    if (content !== undefined) {
      this._content = content;
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Annotations
  // --------------------------------------------------------------------------

  /**
   * Adds an annotation to the document.
   *
   * @param type - Annotation type
   * @param author - Annotation author
   * @param targetText - The text being annotated
   * @param body - Annotation body text
   * @param options - Additional options
   * @returns The annotation ID
   *
   * @example
   * ```typescript
   * const annId = doc.addAnnotation(
   *   AnnotationType.COMMENT,
   *   { name: "Reviewer" },
   *   "important concept",
   *   "This needs more explanation.",
   *   { tags: ["needs-work"] }
   * );
   * ```
   */
  addAnnotation(
    type: AnnotationType,
    author: Author,
    targetText: string,
    body: string,
    options: {
      tags?: string[];
      prefix?: string;
      suffix?: string;
    } = {}
  ): string {
    // Enable collaboration if not already enabled
    if (!this._manifest.toObject().collaboration?.allow_annotations) {
      this._manifest.enableCollaboration();
    }

    const annId = `urn:mdx:annotation:${generateUUID()}`;

    const annotation: Annotation = {
      id: annId,
      type: "Annotation",
      motivation: type,
      created: isoTimestamp(),
      creator: cleanObject(author) as Author,
      target: {
        source: this._manifest.entryPoint,
        selector: {
          type: "TextQuoteSelector",
          exact: targetText,
          prefix: options.prefix,
          suffix: options.suffix,
        },
      },
      body: {
        type: "TextualBody",
        value: body,
        format: "text/plain",
      },
      "mdx:status": AnnotationStatus.OPEN,
      tags: options.tags,
    };

    this._annotations.push(annotation);
    return annId;
  }

  /**
   * Gets annotations, optionally filtered by type.
   *
   * @param type - Optional type filter
   * @returns Array of annotations
   */
  getAnnotations(type?: AnnotationType): Annotation[] {
    if (type) {
      return this._annotations.filter((a) => a.motivation === type);
    }
    return [...this._annotations];
  }

  /**
   * Gets an annotation by ID.
   *
   * @param id - The annotation ID
   * @returns The annotation, or undefined
   */
  getAnnotation(id: string): Annotation | undefined {
    return this._annotations.find((a) => a.id === id);
  }

  /**
   * Updates an annotation's status.
   *
   * @param id - The annotation ID
   * @param status - The new status
   * @returns True if the annotation was found and updated
   */
  updateAnnotationStatus(id: string, status: AnnotationStatus): boolean {
    const annotation = this._annotations.find((a) => a.id === id);
    if (annotation) {
      annotation["mdx:status"] = status;
      annotation.modified = isoTimestamp();
      return true;
    }
    return false;
  }

  /**
   * Adds a reply to an annotation.
   *
   * @param annotationId - The parent annotation ID
   * @param author - Reply author
   * @param body - Reply text
   * @returns The reply ID, or undefined if annotation not found
   */
  addAnnotationReply(
    annotationId: string,
    author: Author,
    body: string
  ): string | undefined {
    const annotation = this._annotations.find((a) => a.id === annotationId);
    if (annotation) {
      const replyId = `${annotationId}:reply:${generateUUID().slice(0, 8)}`;

      if (!annotation["mdx:replies"]) {
        annotation["mdx:replies"] = [];
      }

      annotation["mdx:replies"].push({
        id: replyId,
        created: isoTimestamp(),
        creator: cleanObject(author) as Author,
        body: {
          type: "TextualBody",
          value: body,
          format: "text/plain",
        },
      });

      annotation.modified = isoTimestamp();
      return replyId;
    }
    return undefined;
  }

  /**
   * Removes an annotation.
   *
   * @param id - The annotation ID
   * @returns True if the annotation was removed
   */
  removeAnnotation(id: string): boolean {
    const index = this._annotations.findIndex((a) => a.id === id);
    if (index !== -1) {
      this._annotations.splice(index, 1);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Save and Export
  // --------------------------------------------------------------------------

  /**
   * Saves the document to an MDX file (returns as Blob).
   *
   * @param options - Save options
   * @returns A Blob containing the MDX file
   *
   * @example
   * ```typescript
   * const blob = await doc.save();
   *
   * // Download in browser
   * const url = URL.createObjectURL(blob);
   * const a = document.createElement("a");
   * a.href = url;
   * a.download = "document.mdx";
   * a.click();
   * URL.revokeObjectURL(url);
   * ```
   */
  async save(options: SaveOptions = {}): Promise<Blob> {
    // Validate manifest
    const errors = this._manifest.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid manifest: ${errors.join(", ")}`);
    }

    const zip = new JSZip();

    // Add manifest
    zip.file("manifest.json", this._manifest.toJSON());

    // Add main content
    zip.file(this._manifest.entryPoint, this._content);

    // Add all assets
    for (const [path, data] of this._assets.entries()) {
      zip.file(path, data);
    }

    // Add version history
    if (this._versions.length > 0) {
      const versionsData: VersionHistory = {
        schema_version: "1.0.0",
        current_version: this._manifest.version,
        versions: this._versions,
      };
      zip.file("history/versions.json", JSON.stringify(versionsData, null, 2));
    }

    // Add annotations
    if (this._annotations.length > 0) {
      const annotationsData: AnnotationsFile = {
        schema_version: "1.0.0",
        "@context": "http://www.w3.org/ns/anno.jsonld",
        annotations: this._annotations,
      };
      zip.file(
        "annotations/annotations.json",
        JSON.stringify(annotationsData, null, 2)
      );
    }

    // Generate the ZIP file
    return await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: options.compressionLevel ?? 6,
      },
      mimeType: MDZ_MIME_TYPE,
    });
  }

  /**
   * Saves the document and returns as ArrayBuffer.
   *
   * @param options - Save options
   * @returns ArrayBuffer containing the MDX file
   */
  async saveAsArrayBuffer(options: SaveOptions = {}): Promise<ArrayBuffer> {
    const blob = await this.save(options);
    return await blob.arrayBuffer();
  }

  /**
   * Saves the document and returns as Uint8Array.
   *
   * @param options - Save options
   * @returns Uint8Array containing the MDX file
   */
  async saveAsUint8Array(options: SaveOptions = {}): Promise<Uint8Array> {
    const buffer = await this.saveAsArrayBuffer(options);
    return new Uint8Array(buffer);
  }

  /**
   * Exports the document as standalone HTML.
   *
   * This produces a basic HTML representation. For full-featured
   * rendering, use a dedicated MDX viewer.
   *
   * @param options - Export options
   * @returns HTML string
   */
  toHTML(options: HTMLExportOptions = {}): string {
    // This is a simplified implementation
    // A full implementation would use a proper Markdown parser
    const escapedTitle = this.escapeHTML(this.title);

    let processedContent = this._content;

    // Basic Markdown to HTML conversion (very simplified)
    // In production, use a library like marked or markdown-it
    processedContent = this.basicMarkdownToHTML(processedContent);

    const customCSS = options.customCSS || "";

    return `<!DOCTYPE html>
<html lang="${this._manifest.language || "en"}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
        }
        img { max-width: 100%; height: auto; }
        pre {
            background: #f5f5f5;
            padding: 1rem;
            overflow-x: auto;
            border-radius: 4px;
        }
        code {
            background: #f5f5f5;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Fira Code', monospace;
        }
        pre code { background: none; padding: 0; }
        blockquote {
            border-left: 4px solid #ddd;
            margin-left: 0;
            padding-left: 1rem;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.5rem;
            text-align: left;
        }
        th { background: #f5f5f5; }
        /* v1.1 Alignment classes */
        .align-left { text-align: left; }
        .align-center { text-align: center; }
        .align-right { text-align: right; }
        .align-justify { text-align: justify; }
        ${customCSS}
    </style>
</head>
<body>
<article>
${processedContent}
</article>
</body>
</html>`;
  }

  /**
   * Very basic Markdown to HTML conversion.
   * For production use, this should use a proper Markdown parser.
   */
  private basicMarkdownToHTML(markdown: string): string {
    let html = markdown;

    // Escape HTML entities first (except in code blocks)
    // This is simplified - real implementation needs better handling

    // v1.1: Parse alignment shorthand notation {:.left}, {:.center}, {:.right}, {:.justify}
    // These appear on a separate line before or after block elements
    const alignmentShorthandRegex = /\{:\.(left|center|right|justify)\}/g;

    // v1.1: Parse full attribute blocks {.class #id style="..."}
    const attributeBlockRegex = /\{([^}]+)\}/g;

    // Helper to extract alignment class from attribute string
    const extractAlignmentClass = (
      attrs: string
    ): { alignment: string | null; classes: string[]; id: string | null } => {
      let alignment: string | null = null;
      const classes: string[] = [];
      let id: string | null = null;

      // Parse alignment shorthand :.left, :.center, etc.
      const alignMatch = attrs.match(/:\.(left|center|right|justify)/);
      if (alignMatch) {
        alignment = `align-${alignMatch[1]}`;
      }

      // Parse classes .classname
      const classMatches = attrs.matchAll(/\.([a-zA-Z][\w-]*)/g);
      for (const match of classMatches) {
        if (!match[0].startsWith(":.")) {
          classes.push(match[1]);
        }
      }

      // Parse ID #idname
      const idMatch = attrs.match(/#([a-zA-Z][\w-]*)/);
      if (idMatch) {
        id = idMatch[1];
      }

      return { alignment, classes, id };
    };

    // v1.1: Process headings with alignment attributes
    // Match heading followed by attribute block on same line or next line
    html = html.replace(
      /^(#{1,6})\s+(.+?)\s*(?:\{([^}]+)\})?$/gm,
      (match, hashes, content, attrs) => {
        const level = hashes.length;
        let classAttr = "";
        let idAttr = "";

        if (attrs) {
          const { alignment, classes, id } = extractAlignmentClass(attrs);
          const allClasses = alignment ? [alignment, ...classes] : classes;
          if (allClasses.length > 0) {
            classAttr = ` class="${allClasses.join(" ")}"`;
          }
          if (id) {
            idAttr = ` id="${id}"`;
          }
        }

        return `<h${level}${idAttr}${classAttr}>${content.trim()}</h${level}>`;
      }
    );

    // v1.1: Process paragraphs with alignment (handled later in paragraph section)

    // v1.1: Process container blocks (:::: syntax)
    // Container blocks apply alignment/attributes to all contained content
    // Pattern: ::::{.align-center}\nContent\n::::
    html = html.replace(
      /^::::\s*(?:\{([^}]+)\})?\s*\n([\s\S]*?)^::::\s*$/gm,
      (match, attrs, content) => {
        let classAttr = "";
        let idAttr = "";

        if (attrs) {
          const { alignment, classes, id } = extractAlignmentClass(attrs);
          const allClasses = alignment ? [alignment, ...classes] : classes;
          if (allClasses.length > 0) {
            classAttr = ` class="${allClasses.join(" ")}"`;
          }
          if (id) {
            idAttr = ` id="${id}"`;
          }
        }

        // Wrap content in a div with the container attributes
        return `<div${idAttr}${classAttr}>\n${content.trim()}\n</div>`;
      }
    );

    // v1.1: Process directive container blocks (::::directive-name{attrs}\n...\n::::)
    html = html.replace(
      /^::::(\w+)(?:\s*\{([^}]+)\})?\s*\n([\s\S]*?)^::::\s*$/gm,
      (match, directive, attrs, content) => {
        let classAttr = "";

        if (attrs) {
          const { alignment, classes } = extractAlignmentClass(attrs);
          const allClasses = alignment ? [alignment, ...classes] : classes;
          if (allClasses.length > 0) {
            classAttr = ` class="${allClasses.join(" ")}"`;
          }
        }

        // Handle specific directive types
        if (directive === "note") {
          const typeMatch = attrs?.match(/type="(\w+)"/);
          const noteType = typeMatch ? typeMatch[1] : "note";
          const icons: Record<string, string> = {
            note: "ℹ️",
            warning: "⚠️",
            tip: "💡",
            danger: "🚫",
            success: "✅",
          };
          const icon = icons[noteType] || "ℹ️";
          return `<div${classAttr} role="note" aria-label="${noteType}">\n<strong>${icon} ${noteType.charAt(0).toUpperCase() + noteType.slice(1)}:</strong>\n${content.trim()}\n</div>`;
        }

        if (directive === "details") {
          const summaryMatch = attrs?.match(/summary="([^"]+)"/);
          const summary = summaryMatch ? summaryMatch[1] : "Details";
          return `<details${classAttr}>\n<summary>${summary}</summary>\n${content.trim()}\n</details>`;
        }

        // Generic directive block
        return `<div${classAttr} data-directive="${directive}">\n${content.trim()}\n</div>`;
      }
    );

    // Headings (without attributes - already handled above, but keep for backward compat)
    // Only process if not already converted
    html = html.replace(/^######\s+([^<].+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+([^<].+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+([^<].+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+([^<].+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+([^<].+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+([^<].+)$/gm, "<h1>$1</h1>");

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");

    // Code blocks (simplified)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Horizontal rules
    html = html.replace(/^---+$/gm, "<hr>");
    html = html.replace(/^\*\*\*+$/gm, "<hr>");

    // Blockquotes with v1.1 alignment support
    html = html.replace(
      /^>\s+(.+?)\s*(?:\{([^}]+)\})?$/gm,
      (match, content, attrs) => {
        let classAttr = "";
        if (attrs) {
          const alignMatch = attrs.match(/:\.(left|center|right|justify)/);
          if (alignMatch) {
            classAttr = ` class="align-${alignMatch[1]}"`;
          }
        }
        return `<blockquote${classAttr}>${content}</blockquote>`;
      }
    );

    // v1.1: Parse standalone alignment blocks that apply to next paragraph
    // Pattern: {:.center}\n\nParagraph text
    const alignmentBlockPattern = /^\{:\.(left|center|right|justify)\}\s*\n\n/gm;

    // Paragraphs (simplified) with v1.1 alignment support
    const paragraphs = html.split(/\n\n+/);
    let pendingAlignment: string | null = null;

    html = paragraphs
      .map((p) => {
        p = p.trim();

        // Check for standalone alignment block
        const alignBlockMatch = p.match(/^\{:\.(left|center|right|justify)\}$/);
        if (alignBlockMatch) {
          pendingAlignment = `align-${alignBlockMatch[1]}`;
          return ""; // Remove the alignment block itself
        }

        // Check for inline alignment at end of paragraph
        const inlineAlignMatch = p.match(/^(.+?)\s*\{:\.(left|center|right|justify)\}$/s);
        if (inlineAlignMatch) {
          const [, content, align] = inlineAlignMatch;
          if (
            !content.startsWith("<h") &&
            !content.startsWith("<pre") &&
            !content.startsWith("<hr") &&
            !content.startsWith("<blockquote") &&
            !content.startsWith("<ul") &&
            !content.startsWith("<ol")
          ) {
            return `<p class="align-${align}">${content.trim().replace(/\n/g, "<br>")}</p>`;
          }
        }

        if (
          !p ||
          p.startsWith("<h") ||
          p.startsWith("<pre") ||
          p.startsWith("<hr") ||
          p.startsWith("<blockquote") ||
          p.startsWith("<ul") ||
          p.startsWith("<ol")
        ) {
          pendingAlignment = null;
          return p;
        }

        // Apply pending alignment from previous block
        if (pendingAlignment) {
          const result = `<p class="${pendingAlignment}">${p.replace(/\n/g, "<br>")}</p>`;
          pendingAlignment = null;
          return result;
        }

        return `<p>${p.replace(/\n/g, "<br>")}</p>`;
      })
      .filter((p) => p !== "")
      .join("\n\n");

    return html;
  }

  /**
   * Escapes HTML special characters.
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Creates a clone of this document.
   *
   * @returns A new MDZDocument with the same content
   */
  clone(): MDZDocument {
    const doc = new MDZDocument();
    doc._manifest = MDZManifest.fromObject(
      JSON.parse(JSON.stringify(this._manifest.toObject()))
    );
    doc._content = this._content;
    doc._assets = new Map(this._assets);
    doc._versions = JSON.parse(JSON.stringify(this._versions));
    doc._annotations = JSON.parse(JSON.stringify(this._annotations));
    return doc;
  }

  /**
   * Gets statistics about the document.
   *
   * @returns Document statistics
   */
  getStatistics(): {
    contentLength: number;
    wordCount: number;
    assetCount: number;
    totalAssetSize: number;
    versionCount: number;
    annotationCount: number;
  } {
    const wordCount = this._content
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    let totalAssetSize = 0;
    for (const data of this._assets.values()) {
      totalAssetSize += data.length;
    }

    return {
      contentLength: this._content.length,
      wordCount,
      assetCount: this._assets.size,
      totalAssetSize,
      versionCount: this._versions.length,
      annotationCount: this._annotations.length,
    };
  }
}

// ============================================================================
// Deprecated MDX* aliases (remove after 2027-01-01)
// ============================================================================
//
// Kept so code written before the 2026-04-24 MDX → MDZ rename continues to
// compile and run unchanged. These aliases point at the exact same runtime
// values and types as their MDZ* counterparts — there's no behavioral
// difference, only a name difference.
//
// New code MUST use the MDZ* names. Linters / style guides should flag any
// new usage of the MDX* aliases.

/** @deprecated Use `MDZDocument`. */
export const MDXDocument = MDZDocument;
/** @deprecated Use `MDZManifest`. */
export const MDXManifest = MDZManifest;
/** @deprecated Use `MDZManifestData`. */
export type MDXManifestData = MDZManifestData;

// ============================================================================
// Export Default
// ============================================================================

export default MDZDocument;
