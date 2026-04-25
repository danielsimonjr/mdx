/**
 * Unit tests for the editor pane's pure helpers.
 *
 * The CodeMirror-driven body of `createEditorPane` requires a real
 * browser DOM (linkedom doesn't expose `getBoundingClientRect` in a
 * way CodeMirror's measurement layer accepts). Those code paths are
 * exercised by Phase 2.3a.6 Playwright integration tests; here we
 * cover the framework-agnostic logic:
 *   - `makeDebouncer`: schedule / flush / cancel semantics, last-write-
 *     wins coalescing.
 *   - `applyModeClass` + `modeClassName`: pure DOM-classlist writes,
 *     idempotent.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeDebouncer,
  applyModeClass,
  modeClassName,
  type ViewMode,
} from "../src/renderer/editor-pane-helpers.js";

describe("makeDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("fires once after the debounce window with the latest value", () => {
    const fn = vi.fn();
    const d = makeDebouncer(fn, 100);
    d.schedule("first");
    d.schedule("second");
    d.schedule("third");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  it("does NOT fire if cancel() is called before the timer expires", () => {
    const fn = vi.fn();
    const d = makeDebouncer(fn, 100);
    d.schedule("x");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush() fires immediately with the pending value and clears the timer", () => {
    const fn = vi.fn();
    const d = makeDebouncer(fn, 100);
    d.schedule("flush-me");
    d.flush();
    expect(fn).toHaveBeenCalledWith("flush-me");
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // no late firing
  });

  it("flush() with no pending call is a no-op", () => {
    const fn = vi.fn();
    const d = makeDebouncer(fn, 100);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("repeated schedule() resets the timer (last-call-wins window)", () => {
    const fn = vi.fn();
    const d = makeDebouncer(fn, 100);
    d.schedule("a");
    vi.advanceTimersByTime(80);
    d.schedule("b"); // resets the timer
    vi.advanceTimersByTime(80); // total 160 since first schedule
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20); // 100 since the second schedule
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("b");
  });
});

// ---------------------------------------------------------------------------
// Mode class management
// ---------------------------------------------------------------------------

describe("modeClassName", () => {
  it.each<ViewMode>(["source", "preview", "split"])(
    "returns mode-<mode> for %s",
    (m) => {
      expect(modeClassName(m)).toBe(`mode-${m}`);
    },
  );
});

/**
 * Minimal Element-like fake — `applyModeClass` only touches
 * `classList.add` / `.remove` / iteration, so a tiny stand-in is
 * enough. Using a full linkedom Document here would pull in browser
 * globals just for two assertions.
 */
function makeFakeHost(initial: string[] = []): HTMLElement {
  const list = new Set(initial);
  const classList = {
    add: (...cls: string[]) => {
      for (const c of cls) list.add(c);
    },
    remove: (...cls: string[]) => {
      for (const c of cls) list.delete(c);
    },
    contains: (c: string) => list.has(c),
    [Symbol.iterator]: () => list[Symbol.iterator](),
  };
  // Minimal HTMLElement surface — applyModeClass only calls classList
  // and Array.from(classList).
  return { classList } as unknown as HTMLElement;
}

describe("applyModeClass", () => {
  it("adds the new mode class on a fresh host", () => {
    const host = makeFakeHost();
    applyModeClass(host, "split");
    expect(host.classList.contains("mode-split")).toBe(true);
  });

  it("replaces a prior mode class — only one mode-* class active at a time", () => {
    const host = makeFakeHost(["mode-source", "other-class"]);
    applyModeClass(host, "preview");
    expect(host.classList.contains("mode-source")).toBe(false);
    expect(host.classList.contains("mode-preview")).toBe(true);
    // Non-mode classes are preserved.
    expect(host.classList.contains("other-class")).toBe(true);
  });

  it("is idempotent — applying the same mode twice doesn't break", () => {
    const host = makeFakeHost();
    applyModeClass(host, "split");
    applyModeClass(host, "split");
    expect(host.classList.contains("mode-split")).toBe(true);
  });

  it("clears multiple stale mode-* classes if the host accumulated them", () => {
    // Defensive: a buggy caller might leave several mode-* classes on
    // the host. The function should clean ALL of them.
    const host = makeFakeHost(["mode-source", "mode-preview", "keep"]);
    applyModeClass(host, "split");
    expect(host.classList.contains("mode-source")).toBe(false);
    expect(host.classList.contains("mode-preview")).toBe(false);
    expect(host.classList.contains("mode-split")).toBe(true);
    expect(host.classList.contains("keep")).toBe(true);
  });
});
