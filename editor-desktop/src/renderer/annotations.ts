/**
 * Peer-review annotation data layer — Phase 2.3b.4.
 *
 * Implements the data side of `spec/directives/peer-review-annotations.md`:
 *
 *   - Annotation type aligned with the W3C Web Annotation Data Model
 *     (REC 2017-02-23) plus MDZ's `role` field and four extended
 *     `motivation` values (`review-accept`, `review-reject`,
 *     `review-request-changes`, `review-confidential-comment`).
 *   - Loaders that read `annotations/*.json` from a parsed archive's
 *     entry map, with strict validation per the spec.
 *   - Threading helper that turns a flat annotation list into a
 *     reply tree (ordered by `created` timestamp at every level).
 *
 * The UI layer (sidebar with collapsible threads) lives in the
 * renderer and is wired in a Phase 2.3b.4.2 follow-up; the data
 * layer here is enough for headless conformance testing and for
 * journal-tooling integrations that don't need a UI.
 */

export type AnnotationRole = "author" | "reviewer" | "editor" | "reader";

/**
 * Spec-defined motivations. The W3C list has 13; we add four more
 * for review workflows. Readers that don't recognise the extended
 * values fall back to `commenting` (per the spec).
 */
export const W3C_MOTIVATIONS = [
  "assessing",
  "bookmarking",
  "classifying",
  "commenting",
  "describing",
  "editing",
  "highlighting",
  "identifying",
  "linking",
  "moderating",
  "questioning",
  "replying",
  "tagging",
] as const;
export const MDZ_REVIEW_MOTIVATIONS = [
  "review-accept",
  "review-reject",
  "review-request-changes",
  "review-confidential-comment",
] as const;
export type Motivation =
  | (typeof W3C_MOTIVATIONS)[number]
  | (typeof MDZ_REVIEW_MOTIVATIONS)[number];

const ALL_MOTIVATIONS = new Set<string>([...W3C_MOTIVATIONS, ...MDZ_REVIEW_MOTIVATIONS]);

export interface AnnotationCreator {
  /** A DID URL or other resolvable identifier. */
  id: string;
  /** Display name (may be a pseudonym for double-blind review). */
  name?: string;
}

export interface TextQuoteSelector {
  type: "TextQuoteSelector";
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface AnnotationTarget {
  /** Archive-relative path the annotation refers to. */
  source: string;
  selector?: TextQuoteSelector;
}

export interface Annotation {
  "@context"?: string;
  /** Stable archive-relative `annotations/<uuid>.json` path. */
  id: string;
  type: "Annotation";
  role: AnnotationRole;
  motivation: Motivation;
  body?: {
    type: string;
    value?: string;
    format?: string;
    language?: string;
  };
  /**
   * Either an `AnnotationTarget` (line-level / block-level reference
   * into the manuscript) OR a string referencing another
   * annotation's `id` (a reply).
   */
  target: AnnotationTarget | string;
  creator?: AnnotationCreator;
  created?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface AnnotationParseError {
  path: string;
  field: string;
  message: string;
}

export interface AnnotationParseResult {
  annotations: Annotation[];
  errors: AnnotationParseError[];
}

const VALID_ROLES = new Set<AnnotationRole>(["author", "reviewer", "editor", "reader"]);

/**
 * Parse a single annotation JSON blob with strict shape checks.
 * Returns `null` (and a populated `errors`) for malformed input
 * rather than throwing — so a single bad annotation file doesn't
 * sink the whole load.
 */
export function parseAnnotation(
  raw: string,
  path: string,
): { ok: true; annotation: Annotation } | { ok: false; error: AnnotationParseError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: { path, field: "(json)", message: (e as Error).message } };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: { path, field: "(root)", message: "annotation must be a JSON object" } };
  }
  const obj = parsed as Record<string, unknown>;
  // Required: type, role, motivation, target. id falls back to path.
  if (obj.type !== "Annotation") {
    return { ok: false, error: { path, field: "type", message: "must be the literal string 'Annotation'" } };
  }
  if (typeof obj.role !== "string" || !VALID_ROLES.has(obj.role as AnnotationRole)) {
    return { ok: false, error: { path, field: "role", message: `must be one of ${[...VALID_ROLES].join(", ")}` } };
  }
  if (typeof obj.motivation !== "string" || !ALL_MOTIVATIONS.has(obj.motivation)) {
    return { ok: false, error: { path, field: "motivation", message: `unknown motivation '${String(obj.motivation)}'` } };
  }
  if (obj.target == null) {
    return { ok: false, error: { path, field: "target", message: "target is required" } };
  }
  if (typeof obj.target !== "string") {
    const t = obj.target as Record<string, unknown>;
    if (typeof t.source !== "string") {
      return { ok: false, error: { path, field: "target.source", message: "target.source is required" } };
    }
  }
  // Spec rule: editor decisions must be signed; we can't check
  // signatures here (those live in security/signatures.json), but
  // we tag the annotation so the UI can render the warning.
  const annotation: Annotation = {
    "@context": typeof obj["@context"] === "string" ? obj["@context"] : undefined,
    id: typeof obj.id === "string" ? obj.id : path,
    type: "Annotation",
    role: obj.role as AnnotationRole,
    motivation: obj.motivation as Motivation,
    body: obj.body as Annotation["body"] | undefined,
    target: obj.target as Annotation["target"],
    creator: obj.creator as AnnotationCreator | undefined,
    created: typeof obj.created === "string" ? obj.created : undefined,
  };
  return { ok: true, annotation };
}

/**
 * Walk an archive's entry map and parse every `annotations/*.json`
 * file. Files that fail to parse are reported in `errors` rather
 * than thrown — the editor still loads the rest.
 */
export function loadAnnotations(
  entries: ReadonlyMap<string, Uint8Array>,
): AnnotationParseResult {
  const out: AnnotationParseResult = { annotations: [], errors: [] };
  const decoder = new TextDecoder();
  for (const [path, bytes] of entries) {
    if (!path.startsWith("annotations/") || !path.endsWith(".json")) continue;
    const raw = decoder.decode(bytes);
    const result = parseAnnotation(raw, path);
    if (result.ok) out.annotations.push(result.annotation);
    else out.errors.push(result.error);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Threading
// ---------------------------------------------------------------------------

export interface AnnotationThreadNode {
  annotation: Annotation;
  /** Replies sorted by `created` ascending. */
  replies: AnnotationThreadNode[];
}

/**
 * Build a reply tree from a flat annotation list. The MDZ spec
 * encodes replies as `motivation: "replying"` with a string
 * `target` pointing at the parent's `id`. Annotations whose
 * `target` is an object (i.e. a reference into the manuscript) or
 * whose target id doesn't resolve become roots.
 *
 * Sort key at every level: `created` ascending. Annotations
 * missing `created` sort last (reading-order fallback).
 */
export function buildThreads(annotations: ReadonlyArray<Annotation>): AnnotationThreadNode[] {
  const nodes = new Map<string, AnnotationThreadNode>();
  for (const a of annotations) nodes.set(a.id, { annotation: a, replies: [] });
  const roots: AnnotationThreadNode[] = [];
  for (const node of nodes.values()) {
    const target = node.annotation.target;
    if (typeof target === "string" && nodes.has(target)) {
      nodes.get(target)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByCreated = (a: AnnotationThreadNode, b: AnnotationThreadNode): number => {
    const ac = a.annotation.created ?? "￿";
    const bc = b.annotation.created ?? "￿";
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  };
  const sortRecursive = (list: AnnotationThreadNode[]): void => {
    list.sort(sortByCreated);
    for (const n of list) sortRecursive(n.replies);
  };
  sortRecursive(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// Trust signals (signature requirements)
// ---------------------------------------------------------------------------

export interface TrustWarning {
  annotationId: string;
  severity: "warning" | "error";
  reason: string;
}

/**
 * Surface signature-requirement violations so the UI can render a
 * trust badge. Per spec:
 *
 *   - `editor` annotations carrying a `review-*` motivation MUST be
 *     signed.
 *   - `author` annotations MUST be signed.
 *
 * `signedCreatorIds` is the set of creator DIDs with a signature in
 * `security/signatures.json`. Pass an empty set when signature data
 * is unavailable; the function then surfaces "unsigned" warnings on
 * everything that requires a signature.
 */
export function findTrustWarnings(
  annotations: ReadonlyArray<Annotation>,
  signedCreatorIds: ReadonlySet<string>,
): TrustWarning[] {
  const out: TrustWarning[] = [];
  for (const a of annotations) {
    const creatorId = a.creator?.id;
    const signed = !!creatorId && signedCreatorIds.has(creatorId);
    if (a.role === "editor" && a.motivation.startsWith("review-") && !signed) {
      out.push({
        annotationId: a.id,
        severity: "error",
        reason: "editor decision is unsigned — possible forgery",
      });
    } else if (a.role === "author" && !signed) {
      out.push({
        annotationId: a.id,
        severity: "warning",
        reason: "author annotation is unsigned",
      });
    } else if (a.role === "reviewer" && !signed) {
      out.push({
        annotationId: a.id,
        severity: "warning",
        reason: "reviewer annotation is unsigned (low trust)",
      });
    }
  }
  return out;
}
