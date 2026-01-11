/**
 * MDX Format Reference Implementation (TypeScript)
 * =================================================
 *
 * A TypeScript library for creating, reading, and manipulating MDX
 * (Markdown eXtended Container) files.
 *
 * This implementation provides:
 * - MDXDocument: Main class for working with MDX files
 * - MDXManifest: Manifest creation and validation
 * - Full type definitions for the MDX format
 * - Browser and Node.js compatibility via JSZip
 *
 * @example
 * ```typescript
 * // Create a new MDX document
 * const doc = MDXDocument.create("My Document", { author: "Author Name" });
 * doc.setContent("# Hello World\n\nThis is my document.");
 * await doc.addImage(imageData, "figure.png", { altText: "Description" });
 * const blob = await doc.save();  // Returns a Blob
 *
 * // Read an existing MDX document
 * const doc = await MDXDocument.open(arrayBuffer);  // Pass ArrayBuffer or Uint8Array
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

/** Current MDX specification version */
export const MDX_VERSION = "1.0.0";

/** MIME type for MDX container files */
export const MDX_MIME_TYPE = "application/vnd.mdx-container+zip";

/** Default file extension */
export const MDX_EXTENSION = ".mdx";

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
  /** Checksum for integrity verification (format: "algorithm:hex") */
  checksum?: string;
  /** Human-readable description */
  description?: string;
  /** Attribution or credit information */
  credit?: string;
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
  /** Parent version (null for initial) */
  parent_version?: string | null;
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
  fallback_behavior?: "show-static-preview" | "show-message" | "hide";
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
  /** Allow script execution */
  allow_scripts?: boolean;
  /** Script sandbox level */
  script_sandbox?: "strict" | "relaxed" | "none";
}

/**
 * Security configuration section.
 */
export interface SecurityConfig {
  /** Integrity verification */
  integrity?: IntegrityConfig;
  /** Digital signature */
  signature?: SignatureConfig;
  /** Permissions */
  permissions?: PermissionsConfig;
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
export interface MDXManifestData {
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
  const buffer = data instanceof ArrayBuffer ? data : data.buffer;

  // Use Web Crypto API
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
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
 * Removes undefined and null values from an object.
 * @param obj - The object to clean
 * @returns A new object with only defined values
 */
export function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

// ============================================================================
// MDXManifest Class
// ============================================================================

/**
 * Manages the MDX document manifest.
 *
 * The manifest contains all metadata about the document, including
 * document info, asset inventory, rendering preferences, and more.
 *
 * @example
 * ```typescript
 * const manifest = new MDXManifest();
 * manifest.title = "My Document";
 * manifest.addAuthor({ name: "John Doe", email: "john@example.com" });
 * ```
 */
export class MDXManifest {
  private _data: MDXManifestData;

  /**
   * Creates a new MDXManifest instance.
   * @param data - Optional initial manifest data
   */
  constructor(data?: Partial<MDXManifestData>) {
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
   * @returns A new MDXManifest instance
   */
  static fromObject(data: MDXManifestData): MDXManifest {
    const manifest = new MDXManifest();
    manifest._data = data;
    return manifest;
  }

  /**
   * Creates a manifest from a JSON string.
   * @param json - The JSON string
   * @returns A new MDXManifest instance
   */
  static fromJSON(json: string): MDXManifest {
    return MDXManifest.fromObject(JSON.parse(json));
  }

  /**
   * Converts the manifest to a plain object.
   * @returns The manifest data object
   */
  toObject(): MDXManifestData {
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
      cleanObject(metadata) as AssetMetadata
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
   * @returns Array of validation error messages (empty if valid)
   */
  validate(): string[] {
    const errors: string[] = [];

    // Check required root fields
    if (!this._data.mdx_version) {
      errors.push("Missing required field: mdx_version");
    }

    // Check document section
    if (!this._data.document) {
      errors.push("Missing required field: document");
    } else {
      const doc = this._data.document;
      if (!doc.id) errors.push("Missing required document field: id");
      if (!doc.title) errors.push("Missing required document field: title");
      if (!doc.created) errors.push("Missing required document field: created");
      if (!doc.modified) errors.push("Missing required document field: modified");
    }

    // Check content section
    if (!this._data.content) {
      errors.push("Missing required field: content");
    } else if (!this._data.content.entry_point) {
      errors.push("Missing required content field: entry_point");
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
}

// ============================================================================
// MDXDocument Class
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
 * const doc = MDXDocument.create("My Report", { author: "Jane Doe" });
 * doc.setContent("# Introduction\n\nThis is my report...");
 * await doc.addImage("figure1.png", { altText: "Figure 1" });
 * await doc.save("report.mdx");
 *
 * // Open an existing document
 * const doc = await MDXDocument.open(fileData);
 * console.log(doc.content);
 * ```
 */
export class MDXDocument {
  private _manifest: MDXManifest;
  private _content: string;
  private _assets: Map<string, Uint8Array>;
  private _versions: VersionEntry[];
  private _annotations: Annotation[];

  /**
   * Creates a new MDXDocument instance.
   * This constructor is private; use static factory methods instead.
   */
  private constructor() {
    this._manifest = new MDXManifest();
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
   * @returns A new MDXDocument instance
   *
   * @example
   * ```typescript
   * const doc = MDXDocument.create("My Document", {
   *   author: "John Doe",
   *   authorEmail: "john@example.com",
   *   description: "A sample document",
   * });
   * ```
   */
  static create(title: string, options: CreateDocumentOptions = {}): MDXDocument {
    const doc = new MDXDocument();
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
   * @returns Promise resolving to the MDXDocument
   * @throws Error if the file is not a valid MDX archive
   *
   * @example
   * ```typescript
   * // From file input
   * const file = fileInput.files[0];
   * const doc = await MDXDocument.open(file);
   *
   * // From ArrayBuffer
   * const response = await fetch("document.mdx");
   * const data = await response.arrayBuffer();
   * const doc = await MDXDocument.open(data);
   * ```
   */
  static async open(data: ArrayBuffer | Uint8Array | Blob): Promise<MDXDocument> {
    const doc = new MDXDocument();

    // Load the ZIP archive
    const zip = new JSZip();
    await zip.loadAsync(data);

    // Read and parse manifest
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      throw new Error("Invalid MDX file: missing manifest.json");
    }
    const manifestText = await manifestFile.async("text");
    doc._manifest = MDXManifest.fromJSON(manifestText);

    // Read main content
    const entryPoint = doc._manifest.entryPoint;
    const contentFile = zip.file(entryPoint);
    if (!contentFile) {
      throw new Error(`Invalid MDX file: missing ${entryPoint}`);
    }
    doc._content = await contentFile.async("text");

    // Load all other files as assets
    const promises: Promise<void>[] = [];

    zip.forEach((relativePath, zipEntry) => {
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
   * @returns Promise resolving to the MDXDocument
   */
  static async openFile(file: File): Promise<MDXDocument> {
    const arrayBuffer = await file.arrayBuffer();
    return MDXDocument.open(arrayBuffer);
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
  get manifest(): MDXManifest {
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
        (metadata as Record<string, unknown>)[key] = value;
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
      return new Blob([data], { type: mimeType });
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
      mimeType: MDX_MIME_TYPE,
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

    // Headings
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

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

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

    // Paragraphs (simplified)
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map((p) => {
        p = p.trim();
        if (
          !p ||
          p.startsWith("<h") ||
          p.startsWith("<pre") ||
          p.startsWith("<hr") ||
          p.startsWith("<blockquote") ||
          p.startsWith("<ul") ||
          p.startsWith("<ol")
        ) {
          return p;
        }
        return `<p>${p.replace(/\n/g, "<br>")}</p>`;
      })
      .join("\n\n");

    return html;
  }

  /**
   * Escapes HTML special characters.
   */
  private escapeHTML(text: string): string {
    const div = { textContent: text } as { textContent: string; innerHTML: string };
    // Simple escape without DOM
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
   * @returns A new MDXDocument with the same content
   */
  clone(): MDXDocument {
    const doc = new MDXDocument();
    doc._manifest = MDXManifest.fromObject(
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
// Export Default
// ============================================================================

export default MDXDocument;
