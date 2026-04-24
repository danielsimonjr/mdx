/**
 * <mdz-viewer> — framework-agnostic web component for rendering MDZ archives.
 *
 * Usage:
 *   <mdz-viewer src="paper.mdz"></mdz-viewer>
 *   <mdz-viewer src="paper.mdz" prefer-locales="ja-JP,en-US"></mdz-viewer>
 *
 * Or programmatic:
 *   const v = document.createElement('mdz-viewer');
 *   v.setArchive(blob);  // ArrayBuffer | Blob | Uint8Array
 *   document.body.appendChild(v);
 *
 * Attributes:
 *   - `src` — URL to fetch an MDZ archive.
 *   - `prefer-locales` — comma-separated BCP 47 tags for locale resolution.
 *   - `theme` — "light" (default) | "dark" | "auto" (matches prefers-color-scheme).
 *   - `show-manifest` — boolean: if present, shows the manifest panel by default.
 *
 * Events:
 *   - `mdz-loaded` — fires after the archive renders. `event.detail.manifest`
 *     holds the parsed manifest.
 *   - `mdz-error` — fires on load failure. `event.detail.userMessage` holds
 *     the end-user-friendly message; `event.detail.error` holds the Error.
 *
 * Design notes:
 *   - Shadow DOM isolates styles from the host page.
 *   - No external CSS — styles inline in the shadow root to stay self-contained.
 *   - Markdown rendered via `marked` with a minimal sanitizer pass; dangerous
 *     HTML is stripped. See `render.ts`.
 *   - Assets (images, video) loaded as blob URLs from the archive; no external
 *     network requests after the archive is fetched (offline-ready).
 */

import { loadArchive, getAssetURL, ArchiveLoadError } from "./archive.js";
import type { LoadedArchive } from "./archive.js";
import { renderMarkdown } from "./render.js";
import type { Manifest } from "./manifest-types.js";

// ---------------------------------------------------------------------------
// Event + element type augmentation
// ---------------------------------------------------------------------------
//
// Declaration merging so callers get full TypeScript autocompletion:
//
//   const viewer = document.querySelector<MDZViewerElement>("mdz-viewer")!;
//   viewer.addEventListener("mdz-loaded", (e) => {
//     console.log(e.detail.manifest.document.title);  // ← typed
//   });
//
// Without this augmentation, `e.detail` is `unknown` and the event type
// isn't inferred from the string "mdz-loaded". CustomEvent detail shapes
// live here; the component below dispatches matching shapes.

export interface MDZLoadedEventDetail {
  manifest: Manifest;
}
export interface MDZErrorEventDetail {
  error: Error;
  userMessage: string;
}

declare global {
  interface HTMLElementEventMap {
    "mdz-loaded": CustomEvent<MDZLoadedEventDetail>;
    "mdz-error": CustomEvent<MDZErrorEventDetail>;
  }
  interface HTMLElementTagNameMap {
    "mdz-viewer": MDZViewerElement;
  }
}

/** Size budget reporting — logged to console.info on load for dev visibility. */
const BUDGET_HINT_KB = 250;

class MDZViewerElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "prefer-locales", "theme"];
  }

  #root: ShadowRoot;
  #archive: LoadedArchive | null = null;
  #objectURLs: string[] = [];
  #connected = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#renderShell();
  }

  connectedCallback(): void {
    this.#connected = true;
    const src = this.getAttribute("src");
    if (src) void this.#loadFromSrc(src);
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#revokeObjectURLs();
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (!this.#connected) return;
    if (name === "src" && newValue && newValue !== oldValue) {
      void this.#loadFromSrc(newValue);
    } else if (name === "theme") {
      this.#applyTheme();
    }
  }

  /**
   * Programmatic load from in-memory bytes. Use when you already have the
   * archive (e.g., from a File input or fetch you've already performed).
   */
  async setArchive(
    source: ArrayBuffer | Uint8Array | Blob,
  ): Promise<void> {
    await this.#load(source);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  async #loadFromSrc(src: string): Promise<void> {
    await this.#load(src);
  }

  async #load(source: ArrayBuffer | Uint8Array | Blob | string): Promise<void> {
    this.#setStatus("loading");
    try {
      const preferred = this.#parsePreferredLocales();
      const archive = await loadArchive(source, { preferredLocales: preferred });
      this.#archive = archive;
      this.#render();
      this.dispatchEvent(
        new CustomEvent("mdz-loaded", {
          detail: { manifest: archive.manifest },
          bubbles: true,
          composed: true,
        }),
      );
      this.#logBudget();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const userMessage =
        err instanceof ArchiveLoadError
          ? err.userMessage
          : "Something went wrong loading this archive.";
      this.#setStatus("error", userMessage);
      this.dispatchEvent(
        new CustomEvent("mdz-error", {
          detail: { error, userMessage },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  #parsePreferredLocales(): string[] {
    const raw = this.getAttribute("prefer-locales");
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  #render(): void {
    if (!this.#archive) return;
    this.#revokeObjectURLs();
    const contentHost = this.#root.querySelector<HTMLElement>(".mdz-content");
    const titleEl = this.#root.querySelector<HTMLElement>(".mdz-title");
    const metaEl = this.#root.querySelector<HTMLElement>(".mdz-meta");
    if (!contentHost || !titleEl || !metaEl) return;

    const { manifest, content, activeLocale } = this.#archive;
    titleEl.textContent = manifest.document.title;

    const authors = (manifest.document.authors ?? [])
      .map((a) => a.name)
      .join(", ");
    const localeHint = activeLocale ? ` · ${activeLocale}` : "";
    metaEl.textContent = `${authors || "—"}${localeHint}`;

    const html = renderMarkdown(content, {
      resolveAsset: (path) => this.#resolveAsset(path),
    });
    // Render is safe-by-construction (sanitizer in render.ts); direct
    // innerHTML is intentional here. Untrusted HTML in the markdown gets
    // stripped before it reaches this line.
    contentHost.innerHTML = html;

    this.#setStatus("ready");
  }

  #resolveAsset(path: string): string | null {
    if (!this.#archive) return null;
    const url = getAssetURL(this.#archive, path);
    if (url) this.#objectURLs.push(url);
    return url;
  }

  #revokeObjectURLs(): void {
    for (const url of this.#objectURLs) URL.revokeObjectURL(url);
    this.#objectURLs = [];
  }

  #setStatus(status: "loading" | "ready" | "error", message?: string): void {
    const statusEl = this.#root.querySelector<HTMLElement>(".mdz-status");
    if (!statusEl) return;
    statusEl.dataset.status = status;
    if (status === "loading") statusEl.textContent = "Loading archive…";
    else if (status === "error") statusEl.textContent = message ?? "Error.";
    else statusEl.textContent = "";
  }

  #applyTheme(): void {
    const theme = this.getAttribute("theme") ?? "light";
    this.#root.host.setAttribute("data-theme", theme);
  }

  #logBudget(): void {
    if (!this.#archive) return;
    const totalBytes = Array.from(this.#archive.entries.values()).reduce(
      (sum, b) => sum + b.byteLength,
      0,
    );
    const kb = Math.round(totalBytes / 1024);
    if (kb > BUDGET_HINT_KB * 4) {
      console.info(
        `[mdz-viewer] loaded ${kb}KB archive; this is larger than the ` +
          `typical ${BUDGET_HINT_KB}KB viewer budget — consider lazy-loading ` +
          `assets via external references instead of embedding.`,
      );
    }
  }

  #renderShell(): void {
    this.#root.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          font-family: system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: var(--mdz-text, #1a1a1a);
          background: var(--mdz-bg, #ffffff);
          max-width: var(--mdz-max-width, 48rem);
          margin: 0 auto;
          padding: 1.5rem;
          box-sizing: border-box;
        }
        :host([data-theme="dark"]) {
          --mdz-text: #f5f5f5;
          --mdz-bg: #111111;
          --mdz-meta: #888;
          --mdz-link: #60a5fa;
          --mdz-code-bg: #1f1f1f;
          --mdz-border: #333;
        }
        :host([data-theme="auto"]) {
          /* Respects the user's OS preference. */
          color-scheme: light dark;
        }
        @media (prefers-color-scheme: dark) {
          :host([data-theme="auto"]) {
            --mdz-text: #f5f5f5;
            --mdz-bg: #111111;
            --mdz-meta: #888;
            --mdz-link: #60a5fa;
            --mdz-code-bg: #1f1f1f;
            --mdz-border: #333;
          }
        }
        :host {
          --mdz-meta: #555;
          --mdz-link: #1d4ed8;
          --mdz-code-bg: #f5f5f5;
          --mdz-border: #e5e5e5;
        }
        header {
          border-bottom: 1px solid var(--mdz-border);
          padding-bottom: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .mdz-title {
          margin: 0;
          font-size: 1.75rem;
          line-height: 1.2;
          font-weight: 700;
        }
        .mdz-meta {
          margin-top: 0.25rem;
          color: var(--mdz-meta);
          font-size: 0.9rem;
        }
        .mdz-status {
          color: var(--mdz-meta);
          font-style: italic;
          padding: 0.5rem 0;
        }
        .mdz-status[data-status="error"] {
          color: #dc2626;
          font-style: normal;
          font-weight: 600;
          padding: 0.75rem 1rem;
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 4px;
        }
        :host([data-theme="dark"]) .mdz-status[data-status="error"],
        :host([data-theme="auto"]) @media (prefers-color-scheme: dark) {
          .mdz-status[data-status="error"] {
            background: #3a1010;
            border-color: #7f1d1d;
            color: #fecaca;
          }
        }
        .mdz-content :is(h1, h2, h3, h4, h5, h6) {
          line-height: 1.25;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        .mdz-content img { max-width: 100%; height: auto; }
        .mdz-content video, .mdz-content audio { max-width: 100%; }
        .mdz-content pre {
          background: var(--mdz-code-bg);
          padding: 0.75rem 1rem;
          overflow-x: auto;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .mdz-content code {
          background: var(--mdz-code-bg);
          padding: 0.1em 0.3em;
          border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9em;
        }
        .mdz-content pre code { background: none; padding: 0; }
        .mdz-content blockquote {
          border-left: 3px solid var(--mdz-border);
          padding-left: 1rem;
          margin-left: 0;
          color: var(--mdz-meta);
        }
        .mdz-content a { color: var(--mdz-link); }
        .mdz-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .mdz-content th, .mdz-content td {
          border: 1px solid var(--mdz-border);
          padding: 0.5rem;
          text-align: left;
        }
        .mdz-content .align-left { text-align: left; }
        .mdz-content .align-center { text-align: center; }
        .mdz-content .align-right { text-align: right; }
        .mdz-content .align-justify { text-align: justify; }
      </style>
      <article aria-live="polite">
        <header>
          <h1 class="mdz-title"></h1>
          <div class="mdz-meta"></div>
        </header>
        <div class="mdz-status" data-status="idle"></div>
        <main class="mdz-content"></main>
      </article>
    `;
    this.#applyTheme();
  }
}

// Registration is idempotent — safe to import multiple times.
if (!customElements.get("mdz-viewer")) {
  customElements.define("mdz-viewer", MDZViewerElement);
}

export { MDZViewerElement };
export default MDZViewerElement;
