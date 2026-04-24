/**
 * Minimal subset of the MDZ manifest shape the viewer actually consumes.
 *
 * This is NOT a duplicate of `implementations/typescript/mdx_format.ts` —
 * the viewer is intentionally read-only and doesn't need writer ergonomics
 * (setters, validators, cleanObject, etc.). Keeping a narrow internal type
 * lets the viewer ship independently of the full SDK.
 *
 * When the spec revises manifest fields, this file is the viewer's
 * single point of update; the full SDK remains the writer-side authority.
 */

export interface Author {
  name: string;
  email?: string;
  url?: string;
  did?: string;
  role?: string;
  organization?: string;
}

export interface DocumentInfo {
  id: string;
  content_id?: string;
  title: string;
  subtitle?: string;
  description?: string;
  authors?: Author[];
  created: string;
  modified: string;
  version?: string;
  language?: string;
  license?: string | { type: string; url?: string };
  keywords?: string[];
  cover_image?: string;
  profile?: string;
  accessibility?: {
    summary?: string;
    features?: string[];
    hazards?: string[];
    api_compliance?: string[];
  };
}

export interface ContentConfig {
  entry_point: string;
  encoding?: string;
  markdown_variant?: string;
  extensions?: string[];
  locales?: {
    default: string;
    available: Array<{
      tag: string;
      entry_point: string;
      title?: string;
    }>;
    fallback?: string[];
  };
  variants?: Array<{
    id: string;
    entry_point: string;
    audience?: string;
  }>;
}

export interface AssetEntry {
  path: string;
  mime_type: string;
  size_bytes?: number;
  content_hash?: string;
  checksum?: string;
  alt_text?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
}

export interface Manifest {
  mdx_version: string;
  document: DocumentInfo;
  content: ContentConfig;
  assets?: {
    images?: AssetEntry[];
    video?: AssetEntry[];
    audio?: AssetEntry[];
    models?: AssetEntry[];
    documents?: AssetEntry[];
    data?: AssetEntry[];
    fonts?: AssetEntry[];
    other?: AssetEntry[];
  };
}

/**
 * Accepted MIME types on read. Written archives should use the first one;
 * the second is retained for legacy .mdx archives through 2027-01-01.
 */
export const ACCEPTED_MIME_TYPES: readonly string[] = [
  "application/vnd.mdz-container+zip",
  "application/vnd.mdx-container+zip",
] as const;
