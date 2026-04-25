/**
 * Accessibility rule scanner — JS port of the rules in
 * `editor-desktop/src/renderer/accessibility-checker.ts` and
 * `tests/accessibility/run_accessibility.py`. All three implementations
 * stay in lockstep — every rule here corresponds to one in each
 * sibling file.
 *
 * What this catches (structural / static checks):
 *   - Empty image alt text          (WCAG 1.1.1)
 *   - Heading-level skips           (WCAG 2.4.10)
 *   - Vague link text               (WCAG 2.4.4)
 *   - Missing language declaration  (WCAG 3.1.1)
 *
 * What it does NOT catch (would need a real browser):
 *   - Color contrast, keyboard nav, focus visible, ARIA correctness
 */

'use strict';

const VAGUE_LINK_TEXTS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this link', 'click',
]);

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const HEADING_RE = /^(#{1,6})\s+/;

/**
 * Run all rules over `markdown` (and optionally a manifest, for the
 * language check). Returns violations in document order.
 *
 * @param {string} markdown
 * @param {object|null} manifest
 * @returns {Array<{rule:string, wcag:string, message:string, line:number}>}
 */
function checkMarkdown(markdown, manifest = null) {
  const violations = [];
  const lines = markdown.split(/\r?\n/);

  // Rule 1: image alt text
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(IMAGE_RE)) {
      const alt = m[1].trim();
      if (alt.length === 0) {
        violations.push({
          rule: 'image-alt',
          wcag: '1.1.1',
          message: `image '${m[2].trim()}' has empty alt text`,
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
        rule: 'heading-order',
        wcag: '2.4.10',
        message: `heading level ${level} follows level ${lastLevel} (skipped levels)`,
        line: i + 1,
      });
    }
    lastLevel = level;
  }

  // Rule 3: vague link text — ignore image-link matches by checking
  // whether the position is preceded by `!`.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(LINK_RE)) {
      if (m.index !== undefined && m.index > 0 && line.charAt(m.index - 1) === '!') continue;
      const label = m[1].trim().toLowerCase();
      if (VAGUE_LINK_TEXTS.has(label)) {
        violations.push({
          rule: 'link-name',
          wcag: '2.4.4',
          message: `vague link text '${label}'; link purpose unclear out of context`,
          line: i + 1,
        });
      }
    }
  }

  // Rule 4: manifest.document.language
  if (manifest) {
    const doc = (manifest.document ?? {});
    const lang = typeof doc.language === 'string' ? doc.language : '';
    if (!lang.trim()) {
      violations.push({
        rule: 'document-language',
        wcag: '3.1.1',
        message: 'manifest.document.language is not set',
        line: 0,
      });
    }
  }

  return violations;
}

/**
 * Build the sidecar report JSON object. Caller writes it to disk.
 *
 * Schema:
 *   {
 *     "schema_version": "1.0",
 *     "wcag_version": "2.2",
 *     "wcag_level": "AA",          // Aspirational; the static checker
 *                                  // covers only a subset of A/AA criteria.
 *     "run_at": "<ISO-8601 UTC>",
 *     "tool": "mdz validate --a11y-report",
 *     "scanned": [{ path, locale|null }],
 *     "violations": [
 *       { rule, wcag, severity, message, location: { path, line } }
 *     ],
 *     "summary": { total, by_rule, by_locale }
 *   }
 *
 * @param {Array<{path:string, locale:string|null, content:string}>} scans
 * @param {object|null} manifest
 * @returns {object}
 */
function buildReport(scans, manifest) {
  const violations = [];
  const byRule = Object.create(null);
  const byLocale = Object.create(null);
  for (const scan of scans) {
    // Run language check only on the primary entry-point pass to avoid
    // duplicating a document-level finding once per locale.
    const isPrimary = scan.locale === null;
    const found = checkMarkdown(scan.content, isPrimary ? manifest : null);
    for (const v of found) {
      violations.push({
        rule: v.rule,
        wcag: v.wcag,
        // Coarse severity mapping. Static rules can't distinguish
        // "failure" from "needs review" in axe-core's sense; treat
        // missing-language as warning, the rest as error.
        severity: v.rule === 'document-language' ? 'warning' : 'error',
        message: v.message,
        location: { path: scan.path, line: v.line, locale: scan.locale },
      });
      byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
      const localeKey = scan.locale ?? '<primary>';
      byLocale[localeKey] = (byLocale[localeKey] ?? 0) + 1;
    }
  }
  return {
    schema_version: '1.0',
    wcag_version: '2.2',
    wcag_level: 'AA',
    run_at: new Date().toISOString().replace(/\.\d{3}/, ''),
    tool: 'mdz validate --a11y-report',
    scanned: scans.map((s) => ({ path: s.path, locale: s.locale })),
    violations,
    summary: {
      total: violations.length,
      by_rule: byRule,
      by_locale: byLocale,
    },
  };
}

module.exports = { checkMarkdown, buildReport };
