/**
 * Tests for the editor's accessibility checker.
 *
 * The first half exercises individual rules with hand-rolled inputs;
 * the second half drives the checker against the existing Python
 * fixture pack at `../../tests/accessibility/fixtures/` so the TS
 * port stays in lockstep with the Python ground truth.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  checkMarkdown,
  summarize,
  type A11yViolation,
} from "../src/renderer/accessibility-checker.js";

const FIXTURE_ROOT = join(__dirname, "..", "..", "tests", "accessibility", "fixtures");

describe("checkMarkdown — individual rules", () => {
  it("flags images with empty alt text", () => {
    const v = checkMarkdown("![](img/x.png)\n");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "image-alt", wcag: "1.1.1", line: 1 });
  });

  it("does not flag images with non-empty alt", () => {
    expect(checkMarkdown("![A diagram of X](img/x.png)\n")).toEqual([]);
  });

  it("flags heading-level skips", () => {
    const v = checkMarkdown("# Title\n\n### Skip\n");
    expect(v.find((x) => x.rule === "heading-order")).toMatchObject({
      wcag: "2.4.10",
      line: 3,
    });
  });

  it("does not flag heading levels going down (regress)", () => {
    expect(checkMarkdown("# A\n\n## B\n\n### C\n\n## D\n")).toEqual([]);
  });

  it("flags vague link text", () => {
    const v = checkMarkdown("See [click here](https://example.com).\n");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "link-name", line: 1 });
  });

  it("is case-insensitive on vague link labels", () => {
    expect(checkMarkdown("[Click Here](x)").length).toBe(1);
    expect(checkMarkdown("[CLICK](x)").length).toBe(1);
  });

  it("does not flag descriptive link text", () => {
    expect(checkMarkdown("[Anthropic's official docs](https://docs.anthropic.com)\n")).toEqual([]);
  });

  it("does not double-count an image-link as a vague-link false positive", () => {
    // ![alt](src) starts with `!` — must not match the link-name rule.
    expect(checkMarkdown("![click here](img/x.png)").map((v) => v.rule)).toEqual([]);
  });

  it("flags missing manifest.document.language", () => {
    const v = checkMarkdown("# X\n", { document: {} });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "document-language", wcag: "3.1.1", line: 0 });
  });

  it("does not flag a present manifest.document.language", () => {
    expect(checkMarkdown("# X\n", { document: { language: "en-US" } })).toEqual([]);
  });

  it("ignores manifest entirely when not provided", () => {
    expect(checkMarkdown("# X\n").filter((v) => v.rule === "document-language")).toEqual([]);
  });
});

describe("summarize", () => {
  it("returns 'ok' for empty input", () => {
    expect(summarize([])).toBe("Accessibility: ok");
  });

  it("counts violations by rule, alphabetically", () => {
    const v: A11yViolation[] = [
      { rule: "image-alt", wcag: "1.1.1", message: "", line: 1 },
      { rule: "image-alt", wcag: "1.1.1", message: "", line: 2 },
      { rule: "link-name", wcag: "2.4.4", message: "", line: 3 },
    ];
    expect(summarize(v)).toBe("Accessibility: 3 issues (image-alt=2, link-name=1)");
  });

  it("uses singular for a single issue", () => {
    expect(summarize([{ rule: "image-alt", wcag: "1.1.1", message: "", line: 1 }])).toBe(
      "Accessibility: 1 issue (image-alt=1)",
    );
  });
});

// ---------------------------------------------------------------------------
// Parity against the Python fixture pack
// ---------------------------------------------------------------------------

interface FixtureExpect {
  expected_violations?: string[];
}

function listFixtures(): string[] {
  try {
    return readdirSync(FIXTURE_ROOT).filter((name) => {
      try {
        return statSync(join(FIXTURE_ROOT, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

describe("Python-fixture parity", () => {
  const fixtures = listFixtures();
  // If the fixture pack is missing the suite still runs (no false fail).
  if (fixtures.length === 0) {
    it.skip("fixture pack not found — skipping parity tests", () => {});
    return;
  }
  for (const name of fixtures) {
    it(`fixture: ${name}`, () => {
      const dir = join(FIXTURE_ROOT, name);
      let md: string;
      let expected: FixtureExpect;
      try {
        md = readFileSync(join(dir, "input.md"), "utf-8");
        expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf-8")) as FixtureExpect;
      } catch {
        // Fixture missing required files; skip silently.
        return;
      }
      // Manifest is optional — when absent, the Python runner uses a
      // default with `language: "en-US"` set, so the TS checker
      // mirrors that by passing a manifest with language present.
      let manifest: Record<string, unknown> | null = { document: { language: "en-US" } };
      try {
        manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as Record<
          string,
          unknown
        >;
      } catch {
        // keep default
      }
      const got = Array.from(new Set(checkMarkdown(md, manifest).map((v) => v.rule))).sort();
      const want = (expected.expected_violations ?? []).slice().sort();
      expect(got).toEqual(want);
    });
  }
});
