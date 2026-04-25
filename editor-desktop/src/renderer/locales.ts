/**
 * Multi-locale data layer — Phase 2.3b.5.
 *
 * Two responsibilities:
 *   1. Enumerate the locales declared in `manifest.content.locales`
 *      (per spec §6.4) and resolve each to its archive entry path.
 *   2. Produce a paragraph-alignment table between two locale
 *      sources so the editor's sync-scroll feature can keep the
 *      panes in lockstep.
 *
 * UI (two CodeMirror panes stacked + the sync-scroll handler) is a
 * Phase 2.3b.5.2 follow-up; this module is pure and node-testable.
 */

export interface LocaleEntry {
  /** BCP-47 language tag, e.g. `en-US`. */
  language: string;
  /** Archive-relative path to the locale's content file. */
  path: string;
  /** Whether the manifest tagged this as the primary locale. */
  primary: boolean;
}

interface ContentManifestSlice {
  entry_point?: string;
  locales?: {
    primary?: string;
    available?: ReadonlyArray<{ language: string; path?: string } | string>;
  };
}

/**
 * Read the locale list from a manifest. Robust to two common
 * shapes:
 *
 *   - Object items: `{ language: "en-US", path: "document.md" }`
 *   - String items: `"en-US"` (path defaults to `document.<lang>.md`,
 *     OR `manifest.content.entry_point` for the primary locale).
 *
 * Falls back to a single primary entry if `locales` is absent.
 */
export function enumerateLocales(manifest: Record<string, unknown> | null | undefined): LocaleEntry[] {
  if (!manifest) return [];
  const content = (manifest.content ?? {}) as ContentManifestSlice;
  const entryPoint = content.entry_point ?? "document.md";
  const localesBlock = content.locales;
  if (!localesBlock || !Array.isArray(localesBlock.available) || localesBlock.available.length === 0) {
    // Single-locale fallback.
    const lang = typeof (manifest.document as { language?: string } | undefined)?.language === "string"
      ? ((manifest.document as { language?: string }).language as string)
      : "und";
    return [{ language: lang, path: entryPoint, primary: true }];
  }
  const primaryLang = typeof localesBlock.primary === "string" ? localesBlock.primary : null;
  const out: LocaleEntry[] = [];
  for (const item of localesBlock.available) {
    if (typeof item === "string") {
      const isPrimary = primaryLang === item;
      out.push({
        language: item,
        path: isPrimary ? entryPoint : `document.${item}.md`,
        primary: isPrimary,
      });
    } else if (item && typeof item === "object" && typeof item.language === "string") {
      const isPrimary = primaryLang === item.language;
      out.push({
        language: item.language,
        path: item.path ?? (isPrimary ? entryPoint : `document.${item.language}.md`),
        primary: isPrimary,
      });
    }
  }
  // If no primary was tagged, mark the first entry primary so the
  // UI always has a default.
  if (!out.some((e) => e.primary) && out.length > 0) {
    out[0] = { ...out[0], primary: true };
  }
  return out;
}

/**
 * Build the manifest mutation needed to add a new locale to a
 * document. Returns the patched manifest (deep-cloned — the input
 * is not mutated) plus the path of the new content file the
 * caller should write.
 *
 * Throws if the language tag is already in the available list.
 */
export function planAddLocale(
  manifest: Record<string, unknown>,
  language: string,
): { manifest: Record<string, unknown>; newPath: string } {
  const existing = enumerateLocales(manifest);
  if (existing.some((e) => e.language === language)) {
    throw new Error(`locale '${language}' is already in the manifest`);
  }
  const cloned = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  if (!cloned.content || typeof cloned.content !== "object") cloned.content = {};
  const content = cloned.content as Record<string, unknown>;
  if (!content.locales || typeof content.locales !== "object") {
    content.locales = {
      primary: existing[0]?.language ?? language,
      available: existing.map((e) => ({ language: e.language, path: e.path })),
    };
  }
  const locales = content.locales as { primary?: string; available?: Array<{ language: string; path?: string }> };
  if (!Array.isArray(locales.available)) locales.available = [];
  const newPath = `document.${language}.md`;
  locales.available.push({ language, path: newPath });
  return { manifest: cloned, newPath };
}

// ---------------------------------------------------------------------------
// Paragraph alignment for sync-scroll
// ---------------------------------------------------------------------------

export interface ParagraphSlice {
  /** 0-based paragraph index. */
  index: number;
  /** 1-based starting line number. */
  startLine: number;
  /** Byte length of the slice (paragraph text + trailing newline). */
  length: number;
  /** Trimmed text (used as a cheap alignment fingerprint). */
  text: string;
}

/**
 * Slice a markdown document into paragraph spans (blank-line-
 * separated). Used by sync-scroll to map a scroll offset in pane A
 * to the equivalent offset in pane B.
 */
export function paragraphSlices(source: string): ParagraphSlice[] {
  const lines = source.split(/\r?\n/);
  const out: ParagraphSlice[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;
    const startLine = i + 1;
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      buf.push(lines[i]);
      i++;
    }
    const text = buf.join("\n");
    out.push({
      index: out.length,
      startLine,
      length: text.length + 1, // +1 for trailing newline
      text: text.trim(),
    });
  }
  return out;
}

/**
 * Align two paragraph slice lists by index. Returns pairs
 * `[leftIndex, rightIndex]`; `null` indicates no corresponding
 * paragraph in the other source. The MVP heuristic is "same
 * positional index". A future iteration can add fuzzy matching
 * (Levenshtein on the trimmed text) for translations that
 * inserted / removed paragraphs.
 */
export function alignParagraphs(
  left: ReadonlyArray<ParagraphSlice>,
  right: ReadonlyArray<ParagraphSlice>,
): Array<[number | null, number | null]> {
  const len = Math.max(left.length, right.length);
  const out: Array<[number | null, number | null]> = [];
  for (let i = 0; i < len; i++) {
    out.push([i < left.length ? i : null, i < right.length ? i : null]);
  }
  return out;
}
