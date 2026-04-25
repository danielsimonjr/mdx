/**
 * Accessibility checker — TypeScript port of the Python WCAG-rule
 * scanner at `tests/accessibility/run_accessibility.py`. Both
 * implementations stay in lockstep: every rule here corresponds to
 * one in the Python runner so the existing fixture pack also
 * exercises this code (cross-impl parity is checked manually for
 * now; Phase 3.3 brings a full Playwright + axe-core runner).
 *
 * What this catches (structural / static checks):
 *   - Empty image alt text          (WCAG 1.1.1)
 *   - Heading-level skips           (WCAG 2.4.10)
 *   - Vague link text               (WCAG 2.4.4)
 *   - Missing language declaration  (WCAG 3.1.1)
 *
 * What it does NOT catch (would need a real browser):
 *   - Color contrast, keyboard nav, focus visible, ARIA correctness
 *
 * The editor wires this to a status panel that updates on every
 * debounced source change, and parks findings inline as
 * CodeMirror line markers (Phase 2.3b.2 follow-up).
 */

export interface A11yViolation {
  /** Stable rule identifier, e.g. `image-alt`. */
  rule: string;
  /** WCAG 2.2 success-criterion number, e.g. `1.1.1`. */
  wcag: string;
  /** Human-readable explanation. */
  message: string;
  /** 1-based line number; `0` means document-level (no line). */
  line: number;
}

const VAGUE_LINK_TEXTS = new Set<string>([
  "click here",
  "here",
  "read more",
  "more",
  "link",
  "this link",
  "click",
]);

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const HEADING_RE = /^(#{1,6})\s+/;

/**
 * Run all rules over `markdown` (and optionally a manifest, for
 * the language check). Returns violations in document order — first
 * by line, then by rule emission order within a line.
 */
export function checkMarkdown(
  markdown: string,
  manifest: Record<string, unknown> | null = null,
): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const lines = markdown.split(/\r?\n/);

  // Rule 1: image alt text
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(IMAGE_RE)) {
      const alt = m[1].trim();
      const src = m[2].trim();
      if (alt.length === 0) {
        violations.push({
          rule: "image-alt",
          wcag: "1.1.1",
          message: `image '${src}' has empty alt text`,
          line: i + 1,
        });
      }
    }
  }

  // Rule 2: heading-order skip
  let lastLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    if (lastLevel > 0 && level > lastLevel + 1) {
      violations.push({
        rule: "heading-order",
        wcag: "2.4.10",
        message: `heading level ${level} follows level ${lastLevel} (skipped levels)`,
        line: i + 1,
      });
    }
    lastLevel = level;
  }

  // Rule 3: vague link text
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(LINK_RE)) {
      // Skip image-link matches — IMAGE_RE already covered them and
      // the leading `!` rules out vague-text false positives.
      if (m.index !== undefined && m.index > 0 && line.charAt(m.index - 1) === "!") continue;
      const label = m[1].trim().toLowerCase();
      if (VAGUE_LINK_TEXTS.has(label)) {
        violations.push({
          rule: "link-name",
          wcag: "2.4.4",
          message: `vague link text '${label}'; link purpose unclear out of context`,
          line: i + 1,
        });
      }
    }
  }

  // Rule 4: manifest.document.language
  if (manifest) {
    const doc = (manifest.document ?? {}) as Record<string, unknown>;
    const lang = typeof doc.language === "string" ? doc.language : "";
    if (!lang.trim()) {
      violations.push({
        rule: "document-language",
        wcag: "3.1.1",
        message: "manifest.document.language is not set",
        line: 0,
      });
    }
  }

  return violations;
}

/** Compact summary suitable for a status-bar widget. */
export function summarize(violations: ReadonlyArray<A11yViolation>): string {
  if (violations.length === 0) return "Accessibility: ok";
  const counts: Record<string, number> = {};
  for (const v of violations) counts[v.rule] = (counts[v.rule] ?? 0) + 1;
  const parts = Object.entries(counts)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rule, n]) => `${rule}=${n}`);
  return `Accessibility: ${violations.length} issue${violations.length === 1 ? "" : "s"} (${parts.join(", ")})`;
}
