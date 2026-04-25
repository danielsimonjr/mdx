/**
 * Unit tests for the editor's pure archive-I/O layer.
 *
 * The Electron host is unmocked here on purpose — `archive-io.ts`
 * accepts an injected `FsLike` adapter so production wires
 * `node:fs/promises` while tests wire `MemoryFs`. The IPC handlers
 * in `main.ts` are intentionally thin; their integration with the
 * BrowserWindow / dialog API is verified by Playwright in
 * Phase 2.3a.6 (release-engineering pass), not here.
 */

import { describe, it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import {
  openArchive,
  saveArchive,
  ArchiveOpenError,
  ArchiveSaveError,
  MemoryFs,
} from "../src/main/archive-io.js";

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

const MINIMAL_MANIFEST = {
  mdx_version: "2.0.0",
  document: {
    id: "00000000-0000-0000-0000-000000000123",
    title: "Editor Shell Smoke",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
  },
  content: { entry_point: "document.md" },
};

function buildMdz(extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "manifest.json": enc.encode(JSON.stringify(MINIMAL_MANIFEST)),
    "document.md": enc.encode("# Hello\n\nFrom test.\n"),
    ...extra,
  });
}

describe("openArchive", () => {
  it("reads a valid MDZ and returns parsed manifest + content", async () => {
    const fs = new MemoryFs();
    fs.seed("/tmp/x.mdz", buildMdz());
    const archive = await openArchive("/tmp/x.mdz", fs);
    expect(archive.path).toBe("/tmp/x.mdz");
    expect((archive.manifest.document as { title: string }).title).toBe(
      "Editor Shell Smoke",
    );
    expect(archive.content).toContain("Hello");
    expect(archive.entries.has("manifest.json")).toBe(true);
    expect(archive.entries.has("document.md")).toBe(true);
  });

  it("throws ArchiveOpenError when the file does not exist", async () => {
    const fs = new MemoryFs();
    await expect(openArchive("/tmp/missing.mdz", fs)).rejects.toBeInstanceOf(
      ArchiveOpenError,
    );
  });

  it("throws ArchiveOpenError on non-ZIP bytes", async () => {
    const fs = new MemoryFs();
    fs.seed("/tmp/garbage.mdz", enc.encode("not a zip"));
    await expect(openArchive("/tmp/garbage.mdz", fs)).rejects.toThrow(
      /not a valid ZIP/i,
    );
  });

  it("throws ArchiveOpenError when manifest.json is missing", async () => {
    const fs = new MemoryFs();
    fs.seed(
      "/tmp/no-manifest.mdz",
      zipSync({ "document.md": enc.encode("body") }),
    );
    await expect(openArchive("/tmp/no-manifest.mdz", fs)).rejects.toThrow(
      /missing manifest/i,
    );
  });

  it("throws ArchiveOpenError when manifest.json is invalid JSON", async () => {
    const fs = new MemoryFs();
    fs.seed(
      "/tmp/bad-manifest.mdz",
      zipSync({
        "manifest.json": enc.encode("{ not valid"),
        "document.md": enc.encode("body"),
      }),
    );
    await expect(openArchive("/tmp/bad-manifest.mdz", fs)).rejects.toThrow(
      /not valid JSON/i,
    );
  });

  it("throws ArchiveOpenError when entry_point file is missing", async () => {
    const fs = new MemoryFs();
    fs.seed(
      "/tmp/no-entry.mdz",
      zipSync({ "manifest.json": enc.encode(JSON.stringify(MINIMAL_MANIFEST)) }),
    );
    await expect(openArchive("/tmp/no-entry.mdz", fs)).rejects.toThrow(
      /missing entry_point/i,
    );
  });

  it("honors a custom entry_point declared in the manifest", async () => {
    const fs = new MemoryFs();
    const customManifest = {
      ...MINIMAL_MANIFEST,
      content: { entry_point: "chapters/01.md" },
    };
    fs.seed(
      "/tmp/custom-ep.mdz",
      zipSync({
        "manifest.json": enc.encode(JSON.stringify(customManifest)),
        "chapters/01.md": enc.encode("Custom entry-point body."),
      }),
    );
    const archive = await openArchive("/tmp/custom-ep.mdz", fs);
    expect(archive.content).toBe("Custom entry-point body.");
  });
});

describe("saveArchive", () => {
  it("writes a manifest-first ZIP with content + assets", async () => {
    const fs = new MemoryFs();
    const assets = new Map<string, Uint8Array>([
      ["assets/images/fig.png", new Uint8Array([1, 2, 3])],
    ]);
    await saveArchive(
      "/tmp/out.mdz",
      {
        manifest: MINIMAL_MANIFEST as unknown as Record<string, unknown>,
        content: "# Saved\n",
        assets,
      },
      fs,
    );
    const written = fs.peek("/tmp/out.mdz")!;
    expect(written.byteLength).toBeGreaterThan(0);
    const inflated = unzipSync(written);
    expect(Object.keys(inflated)).toContain("manifest.json");
    expect(Object.keys(inflated)).toContain("document.md");
    expect(Object.keys(inflated)).toContain("assets/images/fig.png");
    expect(dec.decode(inflated["document.md"])).toBe("# Saved\n");
  });

  it("rejects asset paths that collide with the canonical manifest entry", async () => {
    const fs = new MemoryFs();
    const assets = new Map([["manifest.json", enc.encode("hijack")]]);
    await expect(
      saveArchive(
        "/tmp/collision.mdz",
        {
          manifest: MINIMAL_MANIFEST as unknown as Record<string, unknown>,
          content: "body",
          assets,
        },
        fs,
      ),
    ).rejects.toBeInstanceOf(ArchiveSaveError);
  });

  it("round-trips: save then open returns the same manifest title", async () => {
    const fs = new MemoryFs();
    await saveArchive(
      "/tmp/rt.mdz",
      {
        manifest: MINIMAL_MANIFEST as unknown as Record<string, unknown>,
        content: "# Round Trip\n",
      },
      fs,
    );
    const reopened = await openArchive("/tmp/rt.mdz", fs);
    expect(
      (reopened.manifest.document as { title: string }).title,
    ).toBe("Editor Shell Smoke");
    expect(reopened.content).toBe("# Round Trip\n");
  });

  it("manifest.json is the FIRST entry in the saved ZIP (spec §10.2)", async () => {
    const fs = new MemoryFs();
    await saveArchive(
      "/tmp/order.mdz",
      {
        manifest: MINIMAL_MANIFEST as unknown as Record<string, unknown>,
        content: "body",
        assets: new Map([
          ["assets/data/big.csv", new Uint8Array(100)],
          ["assets/images/a.png", new Uint8Array(10)],
        ]),
      },
      fs,
    );
    const written = fs.peek("/tmp/order.mdz")!;
    const inflated = unzipSync(written);
    // fflate's unzipSync returns an object whose key order matches the
    // ZIP's local-header order. manifest.json must be first.
    expect(Object.keys(inflated)[0]).toBe("manifest.json");
  });
});
