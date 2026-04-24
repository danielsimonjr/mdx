// Property-based tests for MDZManifest + pure utilities using fast-check.
// Catches bug classes that example-based tests miss: invariant violations
// under adversarial inputs, signature-chain corner cases, locale tag
// interactions, asset-category boundaries.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  MDZManifest,
  generateUUID,
  sanitizePath,
  cleanObject,
  getExtension,
  getMimeType,
  AssetCategory,
  type SignatureEntry,
  type LocaleAvailable,
} from "./mdx_format.js";

// ---------------------------------------------------------------------------
// Pin seeds for reproducibility — without this, a hypothesis / fast-check
// failure would reproduce with a different counterexample on each CI run,
// making regressions hard to diagnose.
// ---------------------------------------------------------------------------
fc.configureGlobal({ seed: 0x6d647a42 /* "mdzB" */ });

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

const bcp47Tag = fc.constantFrom(
  "en",
  "en-US",
  "en-GB",
  "es-ES",
  "ja-JP",
  "zh-CN",
  "zh-Hant",
  "ar-SA",
  "de-DE",
  "fr-FR",
  "pt-BR",
);

const localeEntry: fc.Arbitrary<LocaleAvailable> = fc.record({
  tag: bcp47Tag,
  entry_point: fc.string({ minLength: 1, maxLength: 40 }).filter(s => !s.includes("\0")),
  title: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
});

const signerRole = fc.constantFrom("author", "reviewer", "editor", "publisher", "notary");
const signerAlgorithm = fc.constantFrom("Ed25519", "RS256", "ES256");

const signatureEntry: fc.Arbitrary<SignatureEntry> = fc.record({
  role: signerRole as fc.Arbitrary<SignatureEntry["role"]>,
  signer: fc.record({
    name: fc.string({ minLength: 1, maxLength: 40 }).filter(s => !s.includes("\0")),
  }) as fc.Arbitrary<SignatureEntry["signer"]>,
  algorithm: signerAlgorithm as fc.Arbitrary<SignatureEntry["algorithm"]>,
  signature: fc.string({ minLength: 1, maxLength: 80 }),
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("property: generateUUID", () => {
  it("always produces RFC 4122 v4 strings", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), () => {
        return uuidRegex.test(generateUUID());
      }),
      { numRuns: 200 },
    );
  });

  it("produces unique values across batches", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 50 }), (n) => {
        const ids = new Set<string>();
        for (let i = 0; i < n; i++) ids.add(generateUUID());
        return ids.size === n;
      }),
      { numRuns: 100 },
    );
  });
});

describe("property: sanitizePath never allows path traversal", () => {
  // Path-traversal security is about SEGMENTS, not substrings. `...`
  // (three dots) is a legal filename in both POSIX and Windows; it
  // contains the substring `..` but is not a parent-directory reference.
  // The correct property is: no path segment equals `..` or `.`.
  it("never produces a `..` segment", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((s) => !s.includes("\0")),
        (input) => {
          const result = sanitizePath(input);
          const segments = result.split("/");
          return !segments.includes("..") && !segments.includes(".");
        },
      ),
      { numRuns: 500 },
    );
  });

  it("never starts with a slash", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((s) => !s.includes("\0")),
        (input) => {
          const result = sanitizePath(input);
          return !result.startsWith("/");
        },
      ),
      { numRuns: 500 },
    );
  });

  it("never contains consecutive slashes", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((s) => !s.includes("\0")),
        (input) => {
          const result = sanitizePath(input);
          return !result.includes("//");
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("cleanObject runtime guard on non-plain objects", () => {
  // The PlainObject<T> conditional type excludes Array/Map/Set/Date at
  // compile time, but if a caller bypasses the type via `any` (or via
  // untyped JS), the runtime guard is the only thing preventing garbage
  // output. Exercise each branch of the guard explicitly.

  it("throws TypeError on Array input", () => {
    expect(() => cleanObject([1, 2, 3] as unknown as object)).toThrow(TypeError);
    expect(() => cleanObject([1, 2, 3] as unknown as object)).toThrow(
      /plain object/,
    );
  });

  it("throws TypeError on Map input", () => {
    expect(() => cleanObject(new Map() as unknown as object)).toThrow(TypeError);
  });

  it("throws TypeError on Set input", () => {
    expect(() => cleanObject(new Set() as unknown as object)).toThrow(TypeError);
  });

  it("throws TypeError on Date input", () => {
    expect(() => cleanObject(new Date() as unknown as object)).toThrow(TypeError);
  });

  it("accepts plain object literals", () => {
    expect(() => cleanObject({ a: 1, b: null })).not.toThrow();
  });

  it("accepts Object.create(null) plain objects", () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj.a = 1;
    obj.b = null;
    expect(() => cleanObject(obj)).not.toThrow();
  });
});

describe("property: cleanObject preserves non-null values", () => {
  // Use Object.hasOwn to avoid false positives from prototype chain —
  // `"constructor" in result` returns true for any plain object because
  // Object.prototype.constructor exists. Own-property check is what we
  // actually want: "did this value end up on the returned object?"
  it("never drops a non-null, non-undefined value", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 12 }).filter((k) => !k.includes("\0")),
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.string({ maxLength: 20 }),
            fc.constant(null),
            fc.constant(undefined),
          ),
        ),
        (dict) => {
          const result = cleanObject(dict as Record<string, unknown>) as Record<
            string,
            unknown
          >;
          for (const [k, v] of Object.entries(dict)) {
            if (v !== null && v !== undefined) {
              if (!Object.prototype.hasOwnProperty.call(result, k)) return false;
              if (result[k] !== v) return false;
            } else {
              if (Object.prototype.hasOwnProperty.call(result, k)) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("property: getMimeType x getExtension is internally consistent", () => {
  it("running getMimeType twice produces the same MIME", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(".png", ".jpg", ".mp4", ".mp3", ".gltf", ".csv", ".mdz", ".mdx"),
        (ext) => {
          return getMimeType(`file${ext}`) === getMimeType(`FILE${ext.toUpperCase()}`);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("getExtension is idempotent on a full path", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("foo.png", "a/b/c.JPG", "nested.tar.gz", "README"),
        (p) => {
          const first = getExtension(p);
          // getExtension(ext) returns ext when passed only the extension part
          return first === "" || getExtension(`x${first}`) === first;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("property: MDZManifest locale helpers round-trip", () => {
  it("every locale added is retrievable in getLocaleTags", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(localeEntry, {
          minLength: 1,
          maxLength: 5,
          selector: (l) => l.tag,
        }),
        (locales) => {
          const m = new MDZManifest();
          for (const l of locales) m.addLocale(l);
          const tags = m.getLocaleTags();
          return (
            tags.length === locales.length &&
            locales.every((l) => tags.includes(l.tag))
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("resolveLocale on empty preferences returns the default", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(localeEntry, {
          minLength: 1,
          maxLength: 5,
          selector: (l) => l.tag,
        }),
        (locales) => {
          const m = new MDZManifest();
          for (const l of locales) m.addLocale(l);
          const resolved = m.resolveLocale([]);
          return resolved?.tag === locales[0].tag; // first added becomes default
        },
      ),
      { numRuns: 200 },
    );
  });

  it("resolveLocale with unknown pref falls back to default", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(localeEntry, {
          minLength: 1,
          maxLength: 5,
          selector: (l) => l.tag,
        }),
        (locales) => {
          const m = new MDZManifest();
          for (const l of locales) m.addLocale(l);
          const resolved = m.resolveLocale(["xx-ZZ-fake"]);
          return resolved?.tag === locales[0].tag;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("property: signature chain invariant under addSignature", () => {
  it("signatures[0] requires no prev_signature; signatures[1+] always do", () => {
    fc.assert(
      fc.property(
        fc.array(signatureEntry, { minLength: 1, maxLength: 5 }),
        (sigs) => {
          const m = new MDZManifest();
          // First entry: no prev_signature required
          m.addSignature(sigs[0]);
          // Subsequent entries: always supply prev_signature to satisfy chain invariant
          for (let i = 1; i < sigs.length; i++) {
            m.addSignature({ ...sigs[i], prev_signature: `sha256:prev-${i}` });
          }
          return m.validate().length === 0;
        },
      ),
      { numRuns: 150 },
    );
  });

  it("omitting prev_signature on entry 1+ always throws", () => {
    fc.assert(
      fc.property(
        fc.tuple(signatureEntry, signatureEntry),
        ([first, second]) => {
          const m = new MDZManifest();
          m.addSignature(first);
          try {
            m.addSignature(second); // deliberately no prev_signature
          } catch (e) {
            return (e as Error).message.includes("prev_signature");
          }
          return false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("customSignerRole runtime validation", () => {
  // The compile-time brand on CustomSignerRole is pure type erasure —
  // nothing at runtime prevents a bare string from being passed into
  // `role: SignerRole`. The constructor's validation is what enforces
  // the "custom roles must be explicitly opted in" contract at runtime.
  // Without this runtime check, the branded type is decorative.

  it("accepts reverse-DNS identifiers", () => {
    const { customSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    expect(() => customSignerRole("com.example.legal-counsel")).not.toThrow();
    expect(() => customSignerRole("org.acme.reviewer.senior")).not.toThrow();
  });

  it("accepts URI-form identifiers", () => {
    const { customSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    expect(() => customSignerRole("https://example.com/roles/translator")).not.toThrow();
    expect(() => customSignerRole("urn:mdz:role:reviewer")).not.toThrow();
  });

  it("rejects built-in role names (use them directly)", () => {
    const { customSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    expect(() => customSignerRole("author")).toThrow(/built-in/);
    expect(() => customSignerRole("reviewer")).toThrow(/built-in/);
    expect(() => customSignerRole("notary")).toThrow(/built-in/);
  });

  it("rejects bare words that look like possible typos", () => {
    const { customSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    // "auther" (typo of author), "reviwer" (typo), "contributor" (plausible
    // built-in that isn't) — all must be rejected because accepting them
    // would silently make typos into "custom" roles.
    expect(() => customSignerRole("auther")).toThrow(/reverse-DNS/);
    expect(() => customSignerRole("reviwer")).toThrow(/reverse-DNS/);
    expect(() => customSignerRole("contributor")).toThrow(/reverse-DNS/);
  });

  it("rejects empty or non-string input", () => {
    const { customSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    expect(() => customSignerRole("")).toThrow();
    expect(() => customSignerRole(undefined as unknown as string)).toThrow();
    expect(() => customSignerRole(42 as unknown as string)).toThrow();
  });

  it("isCustomSignerRole agrees with the constructor", () => {
    const { customSignerRole, isCustomSignerRole } = require("./mdx_format.js") as typeof import("./mdx_format.js");
    const good = customSignerRole("com.example.special");
    expect(isCustomSignerRole(good)).toBe(true);
    expect(isCustomSignerRole("author")).toBe(false); // built-in
    expect(isCustomSignerRole("typo")).toBe(false); // bare word
    expect(isCustomSignerRole(42)).toBe(false); // wrong type
  });
});

describe("property: MDZManifest JSON roundtrip is lossless", () => {
  it("toJSON + fromJSON preserves basic fields", () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 60 }).filter(s => !s.includes("\0")),
          subtitle: fc.string({ maxLength: 80 }).filter(s => !s.includes("\0")),
          language: bcp47Tag,
          version: fc.constantFrom("0.1.0", "1.0.0", "2.0.0", "3.1.4"),
        }),
        (fields) => {
          const m = new MDZManifest();
          m.title = fields.title;
          m.subtitle = fields.subtitle;
          m.language = fields.language;
          m.version = fields.version;
          const restored = MDZManifest.fromJSON(m.toJSON());
          return (
            restored.title === fields.title &&
            restored.subtitle === fields.subtitle &&
            restored.language === fields.language &&
            restored.version === fields.version
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
