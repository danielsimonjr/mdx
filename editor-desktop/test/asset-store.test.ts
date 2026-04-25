/**
 * Tests for the asset-store layer.
 *
 * The renderer wires `AssetStore` to drag-drop events + the SHA-256
 * Web Crypto API; the tests below inject a deterministic fake hasher
 * so vitest can run in Node without a `crypto.subtle` shim.
 */

import { describe, it, expect } from "vitest";
import {
  AssetStore,
  classify,
  formatSize,
  type Hasher,
} from "../src/renderer/asset-store.js";

const enc = new TextEncoder();

/** Deterministic fake hasher: `sha256:<hex of length>`. Lets tests
 *  assert exact contentHash strings without computing real SHA-256. */
const fakeHasher: Hasher = async (bytes) =>
  `sha256:${bytes.byteLength.toString(16).padStart(64, "0")}`;

describe("classify", () => {
  it.each([
    ["fig.png", "images", "image/png"],
    ["data.csv", "data", "text/csv"],
    ["video.mp4", "video", "video/mp4"],
    ["audio.mp3", "audio", "audio/mpeg"],
    ["fonts.woff2", "fonts", "font/woff2"],
    ["report.pdf", "documents", "application/pdf"],
    ["scene.glb", "models", "model/gltf-binary"],
  ])("classifies %s into %s with mime %s", (name, cat, mime) => {
    const c = classify(name);
    expect(c.category).toBe(cat);
    expect(c.mimeType).toBe(mime);
  });

  it("falls back to `other` + octet-stream for unknown extensions", () => {
    expect(classify("notes.xyz")).toEqual({
      category: "other",
      mimeType: "application/octet-stream",
    });
  });

  it("is case-insensitive on the extension", () => {
    expect(classify("FIG.PNG").category).toBe("images");
    expect(classify("DATA.CSV").mimeType).toBe("text/csv");
  });
});

describe("formatSize", () => {
  it.each<[number, string]>([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [10 * 1024, "10 KB"],
    [1024 * 1024, "1.0 MB"],
    [10 * 1024 * 1024, "10 MB"],
  ])("formats %d as %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

describe("AssetStore.add", () => {
  it("places the file under assets/<category>/<basename> and emits a content_hash", async () => {
    const store = new AssetStore(fakeHasher);
    const entry = await store.add("fig.png", enc.encode("PNG-bytes"));
    expect(entry.path).toBe("assets/images/fig.png");
    expect(entry.mimeType).toBe("image/png");
    expect(entry.sizeBytes).toBe(9);
    expect(entry.contentHash).toBe(
      `sha256:${(9).toString(16).padStart(64, "0")}`,
    );
  });

  it("strips path traversal from the input filename", async () => {
    const store = new AssetStore(fakeHasher);
    const entry = await store.add("../../etc/passwd.png", enc.encode("x"));
    // The store NEVER emits a path containing `..` — only the
    // basename survives.
    expect(entry.path).toBe("assets/images/passwd.png");
    expect(entry.path).not.toContain("..");
  });

  it("strips Windows backslash path separators", async () => {
    const store = new AssetStore(fakeHasher);
    const entry = await store.add("C:\\foo\\bar\\fig.png", enc.encode("x"));
    expect(entry.path).toBe("assets/images/fig.png");
  });

  it("last-write-wins on duplicate paths", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("v1"));
    await store.add("fig.png", enc.encode("v2-longer"));
    expect(store.size()).toBe(1);
    const entries = store.list();
    expect(entries[0].sizeBytes).toBe(9);
  });
});

describe("AssetStore.remove", () => {
  it("removes a previously-added entry and reports true", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("x"));
    expect(store.remove("assets/images/fig.png")).toBe(true);
    expect(store.size()).toBe(0);
  });

  it("returns false on a missing path", async () => {
    const store = new AssetStore(fakeHasher);
    expect(store.remove("assets/images/ghost.png")).toBe(false);
  });
});

describe("AssetStore.rename", () => {
  it("renames the basename within the same category", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("x"));
    const renamed = store.rename("assets/images/fig.png", "figure-1.png");
    expect(renamed?.path).toBe("assets/images/figure-1.png");
    expect(store.size()).toBe(1);
  });

  it("returns null when the source path is missing", async () => {
    const store = new AssetStore(fakeHasher);
    expect(store.rename("assets/images/ghost.png", "x.png")).toBeNull();
  });

  it("returns null when the target already exists (no silent clobber)", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("a.png", enc.encode("a"));
    await store.add("b.png", enc.encode("b"));
    expect(store.rename("assets/images/a.png", "b.png")).toBeNull();
    // Both originals untouched.
    expect(store.size()).toBe(2);
  });

  it("rename to identical basename is a no-op (returns existing)", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("x"));
    const same = store.rename("assets/images/fig.png", "fig.png");
    expect(same?.path).toBe("assets/images/fig.png");
    expect(store.size()).toBe(1);
  });

  it("strips path traversal from the rename target", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("x"));
    const renamed = store.rename("assets/images/fig.png", "../bad.png");
    expect(renamed?.path).toBe("assets/images/bad.png");
    expect(renamed?.path).not.toContain("..");
  });
});

describe("AssetStore.manifestProjection", () => {
  it("groups entries by category with spec-conformant fields", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("aaa"));
    await store.add("data.csv", enc.encode("bbbb"));
    const proj = store.manifestProjection();
    expect(Object.keys(proj).sort()).toEqual(["data", "images"]);
    expect(proj.images[0]).toEqual({
      path: "assets/images/fig.png",
      mime_type: "image/png",
      size_bytes: 3,
      content_hash: `sha256:${(3).toString(16).padStart(64, "0")}`,
    });
    expect(proj.data[0].path).toBe("assets/data/data.csv");
  });

  it("sorts entries within each category for stable manifest diffs", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("z.png", enc.encode("z"));
    await store.add("a.png", enc.encode("a"));
    await store.add("m.png", enc.encode("m"));
    const paths = store.manifestProjection().images.map((e) => e.path);
    expect(paths).toEqual([
      "assets/images/a.png",
      "assets/images/m.png",
      "assets/images/z.png",
    ]);
  });

  it("omits empty categories", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("x"));
    const proj = store.manifestProjection();
    expect(Object.keys(proj)).toEqual(["images"]);
  });
});

describe("AssetStore.toEntriesMap", () => {
  it("returns a Map keyed by archive path with raw bytes", async () => {
    const store = new AssetStore(fakeHasher);
    await store.add("fig.png", enc.encode("hello"));
    const m = store.toEntriesMap();
    expect(m.size).toBe(1);
    expect(m.get("assets/images/fig.png")).toEqual(enc.encode("hello"));
  });
});

describe("AssetStore.loadFromArchive", () => {
  it("imports only `assets/...` paths from a loaded archive", async () => {
    const archiveEntries = new Map<string, Uint8Array>([
      ["manifest.json", enc.encode("{}")],
      ["document.md", enc.encode("# Body")],
      ["assets/images/fig.png", enc.encode("png-bytes")],
      ["assets/data/results.csv", enc.encode("a,b,c")],
    ]);
    const store = new AssetStore(fakeHasher);
    await store.loadFromArchive(archiveEntries);
    const paths = store.list().map((e) => e.path).sort();
    expect(paths).toEqual([
      "assets/data/results.csv",
      "assets/images/fig.png",
    ]);
    // manifest.json + document.md are not asset entries.
    expect(store.size()).toBe(2);
  });
});
