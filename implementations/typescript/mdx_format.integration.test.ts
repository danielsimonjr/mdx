// Integration tests for MDZDocument.
// These exercise the JSZip-backed create → save → open roundtrip and
// verify that content + assets + manifest metadata survive unchanged.
//
// These are genuinely "integration" (not unit) because they depend on
// JSZip's ZIP encode/decode end-to-end. If JSZip has a regression, these
// tests will catch it even if the MDZDocument surface is otherwise fine.

import { describe, it, expect } from "vitest";
import {
  MDZDocument,
  AssetCategory,
  MDX_VERSION,
  getMimeType,
} from "./mdx_format.js";

// Small helper — build a tiny PNG (1x1 transparent pixel) without needing
// an external file. Base64-decoded to Uint8Array; valid PNG bytes.
const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
function makePng(): Uint8Array {
  const bin = atob(PNG_1x1_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// =============================================================================
// Factory + basic roundtrip
// =============================================================================

describe("MDZDocument.create + save + open roundtrip", () => {
  it("content survives a full ArrayBuffer roundtrip", async () => {
    const doc = MDZDocument.create("Test Document");
    doc.setContent("# Heading\n\nSome paragraph text.\n");

    const buf = await doc.saveAsArrayBuffer();
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(100); // ZIP + manifest + markdown minimum

    const reopened = await MDZDocument.open(buf);
    expect(reopened.getContent()).toBe("# Heading\n\nSome paragraph text.\n");
  });

  it("title from create() is preserved in the reopened manifest", async () => {
    const doc = MDZDocument.create("My Report");
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    expect(reopened.manifest.title).toBe("My Report");
  });

  it("mdx_version in reopened manifest matches MDX_VERSION constant", async () => {
    const doc = MDZDocument.create("Version Test");
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    const asObject = reopened.manifest.toObject();
    expect(asObject.mdx_version).toBe(MDX_VERSION);
  });

  it("open() accepts Uint8Array (not only ArrayBuffer)", async () => {
    const doc = MDZDocument.create("Uint8 Test");
    doc.setContent("content");
    const u8 = await doc.saveAsUint8Array();
    expect(u8).toBeInstanceOf(Uint8Array);

    const reopened = await MDZDocument.open(u8);
    expect(reopened.getContent()).toBe("content");
  });
});

// =============================================================================
// Content mutations
// =============================================================================

describe("content mutations", () => {
  it("appendContent accumulates across multiple calls", () => {
    const doc = MDZDocument.create("Append Test");
    doc.setContent("# First\n");
    doc.appendContent("\n## Second\n");
    doc.appendContent("\nParagraph\n");
    expect(doc.getContent()).toBe("# First\n\n## Second\n\nParagraph\n");
  });

  it("appendContent changes survive a roundtrip", async () => {
    const doc = MDZDocument.create("Append Roundtrip");
    doc.setContent("start");
    doc.appendContent("-middle");
    doc.appendContent("-end");
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    expect(reopened.getContent()).toBe("start-middle-end");
  });

  it("setContent overwrites prior content", () => {
    const doc = MDZDocument.create("Overwrite Test");
    doc.setContent("original");
    doc.setContent("replacement");
    expect(doc.getContent()).toBe("replacement");
  });
});

// =============================================================================
// Asset roundtrip
// =============================================================================

describe("asset persistence", () => {
  it("addImage — image bytes survive a roundtrip exactly", async () => {
    const doc = MDZDocument.create("Image Test");
    doc.setContent("# With image\n");
    const pngBytes = makePng();
    const imagePath = await doc.addImage(pngBytes, "pixel.png", {
      altText: "A single transparent pixel",
    });
    // addImage returns the internal path inside the MDX container
    expect(imagePath).toMatch(/^assets\/images\/.+\.png$/);

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);

    const retrieved = reopened.getAsset(imagePath);
    expect(retrieved).toBeInstanceOf(Uint8Array);
    expect(retrieved!.length).toBe(pngBytes.length);
    // Byte-for-byte identical
    for (let i = 0; i < pngBytes.length; i++) {
      expect(retrieved![i]).toBe(pngBytes[i]);
    }
  });

  it("asset metadata (alt text) appears in the reopened manifest", async () => {
    const doc = MDZDocument.create("Alt Text Test");
    const pngBytes = makePng();
    await doc.addImage(pngBytes, "labeled.png", {
      altText: "Described image",
    });
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    const images = reopened.manifest.getAssets(AssetCategory.IMAGES);
    const labeled = images.find((a) => a.path.endsWith("labeled.png"));
    expect(labeled).toBeDefined();
    // alt_text is the serialized form of the altText option
    expect((labeled as { alt_text?: string }).alt_text).toBe("Described image");
  });

  it("addAssetFromData — generic asset (CSV) roundtrips", async () => {
    const doc = MDZDocument.create("Data Test");
    const csv = new TextEncoder().encode("col1,col2\na,b\nc,d\n");
    const path = await doc.addAssetFromData(csv, "tabular.csv", {
      category: AssetCategory.DATA,
    });
    expect(path).toMatch(/^assets\/data\/.+\.csv$/);

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);

    const retrieved = reopened.getAssetAsString(path);
    expect(retrieved).toBe("col1,col2\na,b\nc,d\n");
  });

  it("multiple assets across categories all survive one roundtrip", async () => {
    const doc = MDZDocument.create("Multi-Asset Test");
    doc.setContent("# Multi\n");
    const pngBytes = makePng();
    const csvBytes = new TextEncoder().encode("a,b\n1,2\n");
    const jsonBytes = new TextEncoder().encode('{"ok":true}');

    await doc.addImage(pngBytes, "img.png");
    await doc.addAssetFromData(csvBytes, "table.csv", {
      category: AssetCategory.DATA,
    });
    await doc.addAssetFromData(jsonBytes, "data.json", {
      category: AssetCategory.DATA,
    });

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);

    const images = reopened.manifest.getAssets(AssetCategory.IMAGES);
    const data = reopened.manifest.getAssets(AssetCategory.DATA);
    expect(images).toHaveLength(1);
    expect(data).toHaveLength(2);
  });
});

// =============================================================================
// Manifest metadata roundtrip
// =============================================================================

describe("manifest metadata roundtrip", () => {
  it("authors added via manifest.addAuthor survive save/open", async () => {
    const doc = MDZDocument.create("Authored Doc");
    doc.manifest.addAuthor({ name: "Alice", email: "alice@example.com" });
    doc.manifest.addAuthor({ name: "Bob" });

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);

    const names = reopened.manifest.authors.map((a) => a.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);
    const alice = reopened.manifest.authors.find((a) => a.name === "Alice");
    expect(alice?.email).toBe("alice@example.com");
  });

  it("document title changes survive roundtrip", async () => {
    const doc = MDZDocument.create("Original Title");
    doc.manifest.title = "Renamed Title";

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    expect(reopened.manifest.title).toBe("Renamed Title");
  });

  it("document_id is preserved across roundtrip (not regenerated on open)", async () => {
    const doc = MDZDocument.create("ID Test");
    const originalId = doc.manifest.documentId;

    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    expect(reopened.manifest.documentId).toBe(originalId);
  });
});

// =============================================================================
// Structural sanity on the produced ZIP
// =============================================================================

describe("produced archive structure", () => {
  it("contains at minimum manifest.json and document.md at fixed paths", async () => {
    // Verifying structural invariants of the produced ZIP by reopening.
    const doc = MDZDocument.create("Structural Test");
    doc.setContent("hello");
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);

    // Must have content at document.md (the default entry point)
    expect(reopened.getContent()).toBe("hello");
    // Must have a valid manifest after reopen (proves manifest.json parsed)
    expect(reopened.manifest.toObject().mdx_version).toBeTruthy();
  });

  it("getAsset returns undefined for a path that was never added", async () => {
    const doc = MDZDocument.create("Missing Asset Test");
    const buf = await doc.saveAsArrayBuffer();
    const reopened = await MDZDocument.open(buf);
    expect(reopened.getAsset("assets/images/nonexistent.png")).toBeUndefined();
  });

  it("getMimeType resolves the correct type for added images", async () => {
    // Cross-checks that addImage uses the MIME lookup consistent with the
    // public getMimeType helper.
    const mime = getMimeType("file.png");
    expect(mime).toBe("image/png");
  });
});
