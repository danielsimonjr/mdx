/**
 * Pure helpers for the editor pane — no DOM, no CodeMirror, no
 * `<mdz-viewer>` import. Lives in its own module so the unit-test
 * compile path for `makeDebouncer` / `applyModeClass` / `modeClassName`
 * doesn't transit through the viewer package (which extends
 * `HTMLElement` at module load and breaks vitest's Node env).
 *
 * The browser-only `createEditorPane` factory in `editor-pane.ts`
 * imports these helpers and adds the CodeMirror + viewer wiring on
 * top.
 */

export type ViewMode = "source" | "preview" | "split";

/**
 * Create a debouncer that fires `fn` at most once per `delayMs` after
 * the last call. The `flush` method fires immediately with the pending
 * value (used when a callout — file open, programmatic setContent —
 * has to bypass the debounce); `cancel` drops the pending call.
 */
export function makeDebouncer(
  fn: (source: string) => void,
  delayMs: number,
): { schedule(source: string): void; flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  return {
    schedule(source: string) {
      pending = source;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending !== null) fn(pending);
        timer = null;
        pending = null;
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending !== null) {
        fn(pending);
        pending = null;
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/**
 * Class-name suffix applied to the pane host so CSS can style the
 * pane (`.mode-source` hides preview, `.mode-preview` hides source,
 * `.mode-split` shows both).
 */
export function modeClassName(mode: ViewMode): string {
  return `mode-${mode}`;
}

/**
 * Apply `next` and remove any previous `mode-*` classes on the host.
 * Pure DOM writes — no CodeMirror dependency.
 */
export function applyModeClass(host: HTMLElement, next: ViewMode): void {
  const toRemove: string[] = [];
  for (const c of Array.from(host.classList)) {
    if (c.startsWith("mode-")) toRemove.push(c);
  }
  host.classList.remove(...toRemove);
  host.classList.add(modeClassName(next));
}
