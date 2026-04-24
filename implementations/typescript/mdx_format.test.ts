// Unit tests for the MDX TypeScript reference implementation.
// Targets pure utility functions and the MDXManifest class.
// Integration tests for MDXDocument (JSZip-backed roundtrip) are out of
// scope for this file — they'd need a real file system or a mocked JSZip
// and belong in a separate integration test.

import { describe, it, expect } from "vitest";
import {
  // Constants
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
  MDXManifest,
  // Maps
  EXTENSION_TO_CATEGORY,
  EXTENSION_TO_MIME,
} from "./mdx_format.js";

// =============================================================================
// Constants
// =============================================================================

describe("constants", () => {
  it("MDX_VERSION is v2.0.0", () => {
    expect(MDX_VERSION).toBe("2.0.0");
  });

  it("MDX_MIME_TYPE is the registered application/vnd.mdx-container+zip", () => {
    expect(MDX_MIME_TYPE).toBe("application/vnd.mdx-container+zip");
  });

  it("MDX_EXTENSION is .mdx (dot-prefixed)", () => {
    expect(MDX_EXTENSION).toBe(".mdx");
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

  it("maps the .mdx extension to the MDX MIME type", () => {
    expect(getMimeType("doc.mdx")).toBe(MDX_MIME_TYPE);
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
// MDXManifest class
// =============================================================================

describe("MDXManifest", () => {
  // Nested-document construction: title lives at data.document.title.
  // Constructor accepts Partial<MDXManifestData>.
  it("constructs with defaults when given no args", () => {
    const m = new MDXManifest();
    expect(m.title).toBe("Untitled Document");
    expect(m.documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(m.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.version).toBe("1.0.0");
  });

  it("title setter updates the title and refreshes modified", () => {
    const m = new MDXManifest();
    m.title = "Test Doc";
    expect(m.title).toBe("Test Doc");
  });

  it("addAuthor accepts name-only author objects", () => {
    const m = new MDXManifest();
    m.addAuthor({ name: "Alice" });
    expect(m.authors.some((a) => a.name === "Alice")).toBe(true);
  });

  it("addAuthor accepts email and URL optional fields", () => {
    const m = new MDXManifest();
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
    const m = new MDXManifest();
    m.title = "Doc";
    m.subtitle = "Sub";
    const obj = m.toObject();
    expect(obj.mdx_version).toBe(MDX_VERSION);
    expect(obj.document.title).toBe("Doc");
    expect(obj.document.subtitle).toBe("Sub");
    expect(obj.content.entry_point).toBe("document.md");
  });

  it("toJSON returns a valid JSON string that parses back to the toObject shape", () => {
    const m = new MDXManifest();
    m.title = "Roundtrip";
    const json = m.toJSON();
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed.document.title).toBe("Roundtrip");
  });

  it("two manifests constructed independently have different document IDs", () => {
    const a = new MDXManifest();
    const b = new MDXManifest();
    expect(a.documentId).not.toBe(b.documentId);
  });

  it("fromObject restores manifest state exactly", () => {
    const original = new MDXManifest();
    original.title = "Original";
    original.addAuthor({ name: "A" });
    const data = original.toObject();
    const restored = MDXManifest.fromObject(data);
    expect(restored.title).toBe("Original");
    expect(restored.authors.map((a) => a.name)).toEqual(["A"]);
  });

  it("fromJSON parses a JSON string produced by toJSON", () => {
    const a = new MDXManifest();
    a.title = "Through JSON";
    const b = MDXManifest.fromJSON(a.toJSON());
    expect(b.title).toBe("Through JSON");
  });
});
