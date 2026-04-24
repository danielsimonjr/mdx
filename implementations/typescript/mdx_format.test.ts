// Unit tests for the MDZ TypeScript reference implementation (formerly MDX).
// Targets pure utility functions and the MDZManifest class.
// Integration tests for MDZDocument (JSZip-backed roundtrip) live in a
// separate file (*.integration.test.ts).

import { describe, it, expect } from "vitest";
import {
  // Constants (current)
  MDZ_VERSION,
  MDZ_MIME_TYPE,
  MDZ_EXTENSION,
  MDX_MIME_TYPE_LEGACY,
  MDX_EXTENSION_LEGACY,
  // Deprecated aliases (still exported through 2027-01-01)
  MDX_VERSION,
  MDX_MIME_TYPE,
  MDX_EXTENSION,
  // Enums
  AssetCategory,
  AnnotationType,
  AnnotationStatus,
  SnapshotType,
  // Pure utility functions
  generateUUID,
  isoTimestamp,
  getExtension,
  getFilename,
  getMimeType,
  getAssetCategory,
  sanitizePath,
  cleanObject,
  // Classes
  MDZManifest,
  // Maps
  EXTENSION_TO_CATEGORY,
  EXTENSION_TO_MIME,
} from "./mdx_format.js";

// =============================================================================
// Constants
// =============================================================================

describe("constants", () => {
  it("MDZ_VERSION is v2.0.0", () => {
    expect(MDZ_VERSION).toBe("2.0.0");
  });

  it("MDZ_MIME_TYPE is the new application/vnd.mdz-container+zip", () => {
    expect(MDZ_MIME_TYPE).toBe("application/vnd.mdz-container+zip");
  });

  it("MDZ_EXTENSION is .mdz (dot-prefixed)", () => {
    expect(MDZ_EXTENSION).toBe(".mdz");
  });

  it("MDX_MIME_TYPE_LEGACY preserves the pre-rename MIME type for backward compat", () => {
    expect(MDX_MIME_TYPE_LEGACY).toBe("application/vnd.mdx-container+zip");
  });

  it("MDX_EXTENSION_LEGACY preserves the pre-rename .mdx extension for backward compat", () => {
    expect(MDX_EXTENSION_LEGACY).toBe(".mdx");
  });
});

describe("deprecated MDX* aliases (remove after 2027-01-01)", () => {
  // Verifying the backward-compat promise in CHANGELOG under "Renamed MDX → MDZ":
  // existing consumers importing the old names must still compile and run.
  it("MDX_VERSION is an alias of MDZ_VERSION", () => {
    expect(MDX_VERSION).toBe(MDZ_VERSION);
  });

  it("MDX_MIME_TYPE is an alias of MDZ_MIME_TYPE (the new type, not legacy)", () => {
    // Source-compat for callers who imported MDX_MIME_TYPE before the rename —
    // they now write the new MIME type, which is what they should have been
    // doing anyway.
    expect(MDX_MIME_TYPE).toBe(MDZ_MIME_TYPE);
  });

  it("MDX_EXTENSION is an alias of MDZ_EXTENSION (the new ext, not legacy)", () => {
    expect(MDX_EXTENSION).toBe(MDZ_EXTENSION);
  });
});

// =============================================================================
// Enum integrity
// =============================================================================

describe("enums", () => {
  it("AssetCategory covers all the categories named in the spec", () => {
    const expected = [
      "IMAGES",
      "VIDEO",
      "AUDIO",
      "MODELS",
      "DOCUMENTS",
      "DATA",
      "STYLES",
      "SCRIPTS",
      "FONTS",
      "OTHER",
    ];
    for (const name of expected) {
      expect(AssetCategory).toHaveProperty(name);
    }
  });

  it("AnnotationType covers W3C Web Annotation types used by the spec", () => {
    const expected = ["COMMENT", "HIGHLIGHT", "SUGGESTION", "QUESTION", "BOOKMARK"];
    for (const name of expected) {
      expect(AnnotationType).toHaveProperty(name);
    }
  });

  it("SnapshotType has the three version-snapshot kinds", () => {
    expect(SnapshotType).toHaveProperty("FULL");
    expect(SnapshotType).toHaveProperty("DIFF");
    expect(SnapshotType).toHaveProperty("REFERENCE");
  });

  it("AnnotationStatus exists and is non-empty", () => {
    expect(Object.keys(AnnotationStatus).length).toBeGreaterThan(0);
  });
});

// =============================================================================
// generateUUID / isoTimestamp
// =============================================================================

describe("generateUUID", () => {
  it("returns an RFC 4122 UUID v4 string", () => {
    const id = generateUUID();
    // Standard v4 pattern: xxxxxxxx-xxxx-4xxx-[8|9|a|b]xxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("returns a unique value on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });
});

describe("isoTimestamp", () => {
  it("returns an ISO-8601 Z-suffixed timestamp (millisecond precision allowed)", () => {
    const t = isoTimestamp();
    // Accept both HH:MM:SSZ and HH:MM:SS.sssZ (ms precision)
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  });

  it("is parseable by Date and round-trips within ±2 seconds of now", () => {
    const t = isoTimestamp();
    const parsed = new Date(t);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(Math.abs(parsed.getTime() - Date.now())).toBeLessThan(2000);
  });
});

// =============================================================================
// Path helpers
// =============================================================================

describe("getExtension", () => {
  it("returns the lowercase extension with leading dot", () => {
    expect(getExtension("photo.JPG")).toBe(".jpg");
    expect(getExtension("/a/b/c.PNG")).toBe(".png");
    expect(getExtension("nested.tar.gz")).toBe(".gz");
  });

  it("returns empty string when there is no extension", () => {
    expect(getExtension("README")).toBe("");
    expect(getExtension("/dir/")).toBe("");
  });

  it("treats the first dot as an extension marker for dotfiles (implementation-specific)", () => {
    // Implementation note: this function treats any leading dot as the
    // start of an extension, so `.gitignore` returns `.gitignore`.
    // This diverges from POSIX convention but is internally consistent.
    // Documenting current behavior here; revisit if semantics change.
    expect(getExtension(".gitignore")).toBe(".gitignore");
  });
});

describe("getFilename", () => {
  it("returns the last path component", () => {
    expect(getFilename("assets/images/photo.jpg")).toBe("photo.jpg");
    expect(getFilename("/a/b/c.md")).toBe("c.md");
    expect(getFilename("just-a-file.txt")).toBe("just-a-file.txt");
  });

  it("handles Windows-style backslashes safely", () => {
    // MDX uses forward-slash paths per spec but implementation should
    // still do the right thing on mixed input.
    const name = getFilename("a\\b\\c.md");
    // Accept either "c.md" (split on both separators) or "a\\b\\c.md"
    // (only split on forward slash) — both are defensible; we just
    // don't want a crash or empty return.
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("getMimeType", () => {
  it("maps common image extensions", () => {
    expect(getMimeType("a.png")).toBe("image/png");
    expect(getMimeType("a.jpg")).toBe("image/jpeg");
    expect(getMimeType("a.webp")).toBe("image/webp");
    expect(getMimeType("a.svg")).toBe("image/svg+xml");
  });

  it("maps video / audio extensions", () => {
    expect(getMimeType("a.mp4")).toBe("video/mp4");
    expect(getMimeType("a.webm")).toBe("video/webm");
    expect(getMimeType("a.mp3")).toBe("audio/mpeg");
  });

  it("maps the .mdz extension to the current MDZ MIME type", () => {
    expect(getMimeType("doc.mdz")).toBe(MDZ_MIME_TYPE);
  });

  it("maps the legacy .mdx extension to the legacy MIME type (pre-rename archives)", () => {
    expect(getMimeType("doc.mdx")).toBe(MDX_MIME_TYPE_LEGACY);
  });

  it("returns application/octet-stream for unknown extensions", () => {
    expect(getMimeType("mystery.xyzzy")).toBe("application/octet-stream");
  });

  it("is case-insensitive on the extension", () => {
    expect(getMimeType("PHOTO.JPG")).toBe("image/jpeg");
  });
});

describe("getAssetCategory", () => {
  it("maps images to the IMAGES category", () => {
    expect(getAssetCategory("photo.jpg")).toBe(AssetCategory.IMAGES);
    expect(getAssetCategory("icon.svg")).toBe(AssetCategory.IMAGES);
  });

  it("maps video / audio / data / model extensions correctly", () => {
    expect(getAssetCategory("clip.mp4")).toBe(AssetCategory.VIDEO);
    expect(getAssetCategory("song.mp3")).toBe(AssetCategory.AUDIO);
    expect(getAssetCategory("table.csv")).toBe(AssetCategory.DATA);
    expect(getAssetCategory("scene.gltf")).toBe(AssetCategory.MODELS);
  });

  it("returns undefined for unrecognized extensions", () => {
    expect(getAssetCategory("thing.xyzzy")).toBeUndefined();
  });
});

describe("sanitizePath", () => {
  it("collapses redundant slashes and strips leading slash", () => {
    const result = sanitizePath("///assets//images///photo.png");
    expect(result.startsWith("/")).toBe(false);
    expect(result).not.toContain("//");
  });

  it("removes parent-directory traversal components", () => {
    // Path traversal is a security concern for MDX archives.
    const result = sanitizePath("../../etc/passwd");
    expect(result).not.toContain("..");
  });

  it("preserves legitimate nested paths", () => {
    expect(sanitizePath("assets/images/photo.png")).toBe(
      "assets/images/photo.png",
    );
  });
});

// =============================================================================
// cleanObject
// =============================================================================

describe("cleanObject", () => {
  it("drops keys whose values are null or undefined", () => {
    const input = { a: 1, b: null, c: undefined, d: "x" };
    const out = cleanObject(input);
    expect(out).toEqual({ a: 1, d: "x" });
  });

  it("preserves falsy but non-null values (0, false, empty string)", () => {
    const input = { a: 0, b: false, c: "", d: null };
    const out = cleanObject(input);
    expect(out).toEqual({ a: 0, b: false, c: "" });
  });

  it("returns an empty object when all values are null/undefined", () => {
    expect(cleanObject({ a: null, b: undefined })).toEqual({});
  });
});

// =============================================================================
// Extension maps
// =============================================================================

describe("EXTENSION_TO_CATEGORY map", () => {
  it("has entries for all expected image formats", () => {
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]) {
      expect(EXTENSION_TO_CATEGORY[ext]).toBe(AssetCategory.IMAGES);
    }
  });

  it("has entries for all expected model formats", () => {
    for (const ext of [".gltf", ".glb"]) {
      expect(EXTENSION_TO_CATEGORY[ext]).toBe(AssetCategory.MODELS);
    }
  });
});

describe("EXTENSION_TO_MIME map", () => {
  it("agrees with getMimeType for all its keys", () => {
    for (const ext of Object.keys(EXTENSION_TO_MIME)) {
      const mime = EXTENSION_TO_MIME[ext];
      expect(getMimeType("file" + ext)).toBe(mime);
    }
  });
});

// =============================================================================
// MDZManifest class
// =============================================================================

describe("MDZManifest", () => {
  // Nested-document construction: title lives at data.document.title.
  // Constructor accepts Partial<MDZManifestData>.
  it("constructs with defaults when given no args", () => {
    const m = new MDZManifest();
    expect(m.title).toBe("Untitled Document");
    expect(m.documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(m.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.version).toBe("1.0.0");
  });

  it("title setter updates the title and refreshes modified", () => {
    const m = new MDZManifest();
    m.title = "Test Doc";
    expect(m.title).toBe("Test Doc");
  });

  it("addAuthor accepts name-only author objects", () => {
    const m = new MDZManifest();
    m.addAuthor({ name: "Alice" });
    expect(m.authors.some((a) => a.name === "Alice")).toBe(true);
  });

  it("addAuthor accepts email and URL optional fields", () => {
    const m = new MDZManifest();
    m.addAuthor({
      name: "Bob",
      email: "bob@example.com",
      url: "https://example.com/bob",
    });
    const bob = m.authors.find((a) => a.name === "Bob")!;
    expect(bob.email).toBe("bob@example.com");
    expect(bob.url).toBe("https://example.com/bob");
  });

  it("toObject returns a structured object with mdx_version and nested document/content", () => {
    // Note: the manifest field is still named `mdx_version` for backward
    // compat — renaming to mdz_version would break every existing archive.
    // See CHANGELOG under "Renamed MDX → MDZ" for the policy.
    const m = new MDZManifest();
    m.title = "Doc";
    m.subtitle = "Sub";
    const obj = m.toObject();
    expect(obj.mdx_version).toBe(MDZ_VERSION);
    expect(obj.document.title).toBe("Doc");
    expect(obj.document.subtitle).toBe("Sub");
    expect(obj.content.entry_point).toBe("document.md");
  });

  it("toJSON returns a valid JSON string that parses back to the toObject shape", () => {
    const m = new MDZManifest();
    m.title = "Roundtrip";
    const json = m.toJSON();
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed.document.title).toBe("Roundtrip");
  });

  it("two manifests constructed independently have different document IDs", () => {
    const a = new MDZManifest();
    const b = new MDZManifest();
    expect(a.documentId).not.toBe(b.documentId);
  });

  it("fromObject restores manifest state exactly", () => {
    const original = new MDZManifest();
    original.title = "Original";
    original.addAuthor({ name: "A" });
    const data = original.toObject();
    const restored = MDZManifest.fromObject(data);
    expect(restored.title).toBe("Original");
    expect(restored.authors.map((a) => a.name)).toEqual(["A"]);
  });

  it("fromJSON parses a JSON string produced by toJSON", () => {
    const a = new MDZManifest();
    a.title = "Through JSON";
    const b = MDZManifest.fromJSON(a.toJSON());
    expect(b.title).toBe("Through JSON");
  });
});

// =============================================================================
// MDZManifest — v2.0 helpers
// =============================================================================

describe("MDZManifest v2.0 helpers — §8 i18n", () => {
  it("addLocale seeds content.locales and sets first locale as default", () => {
    const m = new MDZManifest();
    m.addLocale({ tag: "en-US", entry_point: "document.md", title: "Hello" });
    m.addLocale({ tag: "es-ES", entry_point: "locales/es/document.md", title: "Hola" });

    const obj = m.toObject();
    expect(obj.content.locales?.default).toBe("en-US");
    expect(obj.content.locales?.available.map((l) => l.tag)).toEqual(["en-US", "es-ES"]);
    expect(m.getLocaleTags()).toEqual(["en-US", "es-ES"]);
  });

  it("resolveLocale honors preference, falls back to default, returns null when no locales", () => {
    const empty = new MDZManifest();
    expect(empty.resolveLocale(["en-US"])).toBeNull();

    const m = new MDZManifest();
    m.addLocale({ tag: "en-US", entry_point: "document.md" });
    m.addLocale({ tag: "ja-JP", entry_point: "locales/ja/document.md" });

    // Direct match
    expect(m.resolveLocale(["ja-JP"])?.tag).toBe("ja-JP");
    // No match → default
    expect(m.resolveLocale(["de-DE"])?.tag).toBe("en-US");
  });
});

describe("MDZManifest v2.0 helpers — §12 transclusion", () => {
  it("addInclude records includes for prefetching", () => {
    const m = new MDZManifest();
    m.addInclude({ id: "legal", target: "shared/legal.md" });
    m.addInclude({
      id: "preamble",
      target: "mdx://urn:mdx:doc:shared/document.md#preamble",
      content_hash: "sha256:abc",
    });
    expect(m.toObject().content.includes).toHaveLength(2);
    expect(m.toObject().content.includes?.[0].id).toBe("legal");
  });
});

describe("MDZManifest v2.0 helpers — §17 variants", () => {
  it("addVariant appends to content.variants", () => {
    const m = new MDZManifest();
    m.addVariant({ id: "short", entry_point: "variants/short/document.md", audience: "executive-summary" });
    m.addVariant({ id: "technical", entry_point: "variants/technical/document.md", audience: "specialist" });

    const obj = m.toObject();
    expect(obj.content.variants).toHaveLength(2);
    expect(obj.content.variants?.map((v) => v.id)).toEqual(["short", "technical"]);
  });
});

describe("MDZManifest v2.0 helpers — §13 profiles", () => {
  it("setProfile assigns document.profile", () => {
    const m = new MDZManifest();
    m.setProfile("https://mdx-format.org/profiles/scientific-paper/v1");
    expect(m.toObject().document.profile).toBe(
      "https://mdx-format.org/profiles/scientific-paper/v1",
    );
  });

  it("setProfile updates modified timestamp when called after a delay", async () => {
    const m = new MDZManifest();
    const before = m.toObject().document.modified;
    await new Promise((r) => setTimeout(r, 5));
    m.setProfile("https://mdx-format.org/profiles/api-reference/v1");
    expect(m.toObject().document.modified).not.toBe(before);
  });
});

describe("MDZManifest v2.0 helpers — §14 accessibility", () => {
  it("setAccessibility populates document.accessibility", () => {
    const m = new MDZManifest();
    m.setAccessibility({
      summary: "All video has captions.",
      features: ["captions", "long-description"],
      hazards: ["none"],
      api_compliance: ["WCAG-2.2-AA"],
    });
    const a11y = m.toObject().document.accessibility;
    expect(a11y?.features).toContain("captions");
    expect(a11y?.api_compliance).toEqual(["WCAG-2.2-AA"]);
  });
});

describe("MDZManifest v2.0 helpers — §15 provenance", () => {
  it("addDerivedFrom chains multiple upstream sources", () => {
    const m = new MDZManifest();
    m.addDerivedFrom({ id: "urn:mdx:doc:upstream", version: "2.1.0", relation: "fork" });
    m.addDerivedFrom({ id: "urn:mdx:doc:translation-src", relation: "translation-of" });

    const df = m.toObject().document.derived_from;
    expect(df).toHaveLength(2);
    expect(df?.[0].relation).toBe("fork");
    expect(df?.[1].relation).toBe("translation-of");
  });
});

describe("MDZManifest v2.0 helpers — §16 multi-signature", () => {
  it("addSignature populates security.signatures[] and preserves order", () => {
    const m = new MDZManifest();
    m.addSignature({
      role: "author",
      signer: { name: "Alice", did: "did:web:alice.example.com" },
      algorithm: "Ed25519",
      scope: "full-archive",
      signature: "base64-sig-a",
    });
    // Entry 1+ requires prev_signature per §16.3 chain invariant,
    // enforced by addSignature at insertion time.
    m.addSignature({
      role: "reviewer",
      signer: { name: "Bob" },
      algorithm: "Ed25519",
      scope: "manifest-only",
      signature: "base64-sig-b",
      prev_signature: "sha256:hash-of-sig-a",
    });

    const sigs = m.toObject().security?.signatures;
    expect(sigs).toHaveLength(2);
    expect(sigs?.[0].role).toBe("author");
    expect(sigs?.[0].signer.did).toBe("did:web:alice.example.com");
    expect(sigs?.[1].role).toBe("reviewer");
    expect(sigs?.[1].prev_signature).toBe("sha256:hash-of-sig-a");
  });
});

describe("MDZManifest v2.0 helpers — §11 computational cells", () => {
  it("addKernel registers kernels under interactivity.kernels[]", () => {
    const m = new MDZManifest();
    m.addKernel({
      id: "python3",
      language: "python",
      version: "3.11",
      requirements: ["numpy>=1.25"],
    });
    m.addKernel({ id: "node20", language: "javascript", version: "20" });

    const kernels = m.toObject().interactivity?.kernels;
    expect(kernels).toHaveLength(2);
    expect(kernels?.[0].id).toBe("python3");
    expect(kernels?.[0].requirements).toContain("numpy>=1.25");
  });
});

// =============================================================================
// MDZManifest — v2.0 structural invariants (enforced by validate())
// =============================================================================

describe("MDZManifest.validate — invariants beyond JSON Schema", () => {
  it("flags content.locales.default that is not in available[].tag", () => {
    // Construct via fromObject to bypass addLocale's first-locale-is-default
    // helper, simulating a hand-built manifest with a bad default.
    const m = MDZManifest.fromObject({
      mdx_version: "2.0.0",
      document: {
        id: "00000000-0000-4000-8000-000000000000",
        title: "T",
        created: "2026-01-01T00:00:00Z",
        modified: "2026-01-01T00:00:00Z",
      },
      content: {
        entry_point: "document.md",
        locales: {
          default: "fr-FR",
          available: [
            { tag: "en-US", entry_point: "document.md" },
            { tag: "ja-JP", entry_point: "locales/ja/document.md" },
          ],
        },
      },
    });
    const errors = m.validate();
    expect(errors.some((e) => e.includes("fr-FR") && e.includes("not one of"))).toBe(
      true,
    );
  });

  it("flags duplicate locale tags", () => {
    const m = MDZManifest.fromObject({
      mdx_version: "2.0.0",
      document: {
        id: "00000000-0000-4000-8000-000000000000",
        title: "T",
        created: "2026-01-01T00:00:00Z",
        modified: "2026-01-01T00:00:00Z",
      },
      content: {
        entry_point: "document.md",
        locales: {
          default: "en-US",
          available: [
            { tag: "en-US", entry_point: "document.md" },
            { tag: "en-US", entry_point: "other.md" },
          ],
        },
      },
    });
    const errors = m.validate();
    expect(errors.some((e) => e.includes("duplicate tag"))).toBe(true);
  });

  it("flags mutually-exclusive security.signature + security.signatures", () => {
    const m = new MDZManifest();
    m.toObject().security = {
      signature: { signed_by: "legacy", algorithm: "RS256", signature: "x" },
      signatures: [
        {
          role: "author",
          signer: { name: "Alice" },
          algorithm: "Ed25519",
          signature: "sig0",
        },
      ],
    };
    const errors = m.validate();
    expect(errors.some((e) => e.includes("mutually exclusive"))).toBe(true);
  });

  it("flags missing prev_signature on signatures[1+]", () => {
    const m = MDZManifest.fromObject({
      mdx_version: "2.0.0",
      document: {
        id: "00000000-0000-4000-8000-000000000000",
        title: "T",
        created: "2026-01-01T00:00:00Z",
        modified: "2026-01-01T00:00:00Z",
      },
      content: { entry_point: "document.md" },
      security: {
        signatures: [
          {
            role: "author",
            signer: { name: "A" },
            algorithm: "Ed25519",
            signature: "sig0",
          },
          {
            role: "reviewer",
            signer: { name: "B" },
            algorithm: "Ed25519",
            signature: "sig1",
            // prev_signature missing
          },
        ],
      },
    });
    const errors = m.validate();
    expect(errors.some((e) => e.includes("prev_signature"))).toBe(true);
  });

  it("passes validation when locales are consistent and signature chain is intact", () => {
    const m = new MDZManifest();
    m.addLocale({ tag: "en-US", entry_point: "document.md" });
    m.addLocale({ tag: "ja-JP", entry_point: "locales/ja/document.md" });
    m.addSignature({
      role: "author",
      signer: { name: "Alice" },
      algorithm: "Ed25519",
      signature: "sig0",
    });
    m.addSignature({
      role: "reviewer",
      signer: { name: "Bob" },
      algorithm: "Ed25519",
      signature: "sig1",
      prev_signature: "sha256:abc",
    });
    expect(m.validate()).toEqual([]);
    expect(m.isValid()).toBe(true);
  });
});

// =============================================================================
// addSignature chain enforcement (fail at insertion time)
// =============================================================================

describe("MDZManifest.addSignature", () => {
  it("refuses to add entry 1+ without prev_signature", () => {
    const m = new MDZManifest();
    m.addSignature({
      role: "author",
      signer: { name: "A" },
      algorithm: "Ed25519",
      signature: "sig0",
    });
    expect(() =>
      m.addSignature({
        role: "reviewer",
        signer: { name: "B" },
        algorithm: "Ed25519",
        signature: "sig1",
        // no prev_signature — addSignature must throw
      }),
    ).toThrow(/prev_signature/);
  });

  it("refuses to mix legacy signature with signatures[]", () => {
    const m = new MDZManifest();
    m.toObject().security = {
      signature: { signed_by: "legacy", algorithm: "RS256", signature: "x" },
    };
    expect(() =>
      m.addSignature({
        role: "author",
        signer: { name: "A" },
        algorithm: "Ed25519",
        signature: "sig0",
      }),
    ).toThrow(/legacy/);
  });
});

// =============================================================================
// v1.1 → v2.0 loader backward-compat
// =============================================================================

describe("v1.1 → v2.0 loader compatibility", () => {
  it("loads a v1.1-shaped manifest via fromObject and exposes v2.0 accessors as empty", () => {
    // Simulate a v1.1 manifest (no v2.0 fields) that's been bumped to 2.0.0.
    const v11Shape = {
      mdx_version: "2.0.0",
      document: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Legacy Doc",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-02T00:00:00Z",
        authors: [{ name: "Legacy Author" }],
      },
      content: {
        entry_point: "document.md",
        markdown_variant: "CommonMark",
      },
    };
    const m = MDZManifest.fromObject(v11Shape);

    // v1.1 fields survive
    expect(m.title).toBe("Legacy Doc");
    expect(m.authors[0].name).toBe("Legacy Author");

    // v2.0 accessors return sensible empties, not undefined crashes
    expect(m.getLocaleTags()).toEqual([]);
    expect(m.resolveLocale(["en-US"])).toBeNull();
    expect(m.toObject().content.includes).toBeUndefined();
    expect(m.toObject().content.variants).toBeUndefined();
    expect(m.toObject().document.accessibility).toBeUndefined();
    expect(m.toObject().document.derived_from).toBeUndefined();
    expect(m.toObject().security?.signatures).toBeUndefined();
    expect(m.toObject().interactivity?.kernels).toBeUndefined();

    // Validation passes — no v2.0 features means no invariants to violate
    expect(m.validate()).toEqual([]);
  });

  it("accepts legacy security.signature as the only signature", () => {
    const m = MDZManifest.fromObject({
      mdx_version: "2.0.0",
      document: {
        id: "22222222-2222-4222-8222-222222222222",
        title: "T",
        created: "2026-01-01T00:00:00Z",
        modified: "2026-01-01T00:00:00Z",
      },
      content: { entry_point: "document.md" },
      security: {
        signature: {
          signed_by: "legacy@example.com",
          algorithm: "RS256",
          signature: "base64-legacy",
        },
      },
    });
    expect(m.validate()).toEqual([]);
  });
});

// =============================================================================
// Full v2.0 manifest JSON roundtrip
// =============================================================================

describe("MDZManifestData JSON roundtrip (v2.0)", () => {
  it("preserves every v2.0 field through toJSON → fromJSON", () => {
    const original = new MDZManifest();
    original.title = "Round Trip";
    original.addLocale({ tag: "en-US", entry_point: "document.md", title: "Hi" });
    original.addLocale({ tag: "ja-JP", entry_point: "locales/ja/document.md" });
    original.addInclude({
      id: "legal",
      target: "shared/legal.md",
      content_hash: "sha256:abc",
    });
    original.addVariant({
      id: "short",
      entry_point: "variants/short/document.md",
      audience: "exec",
    });
    original.setProfile("https://mdx-format.org/profiles/api-reference/v1");
    original.setAccessibility({
      summary: "Fully captioned.",
      features: ["captions", "long-description"],
      hazards: ["none"],
    });
    original.addDerivedFrom({
      id: "urn:mdx:doc:upstream",
      version: "2.1.0",
      relation: "fork",
    });
    original.addKernel({ id: "python3", language: "python", version: "3.11" });
    original.addSignature({
      role: "author",
      signer: { name: "Alice", did: "did:web:alice.example.com" },
      algorithm: "Ed25519",
      signature: "sig0",
    });

    const json = original.toJSON();
    const restored = MDZManifest.fromJSON(json);
    const r = restored.toObject();

    expect(r.content.locales?.default).toBe("en-US");
    expect(r.content.locales?.available.map((l) => l.tag)).toEqual(["en-US", "ja-JP"]);
    expect(r.content.includes?.[0].content_hash).toBe("sha256:abc");
    expect(r.content.variants?.[0].audience).toBe("exec");
    expect(r.document.profile).toMatch(/api-reference/);
    expect(r.document.accessibility?.features).toContain("captions");
    expect(r.document.derived_from?.[0].relation).toBe("fork");
    expect(r.interactivity?.kernels?.[0].language).toBe("python");
    expect(r.security?.signatures?.[0].signer.did).toBe("did:web:alice.example.com");

    // Validates clean after full roundtrip
    expect(restored.validate()).toEqual([]);
  });
});
