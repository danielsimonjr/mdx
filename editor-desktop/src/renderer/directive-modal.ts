/**
 * Minimal `<dialog>`-based modal scaffolding for the picker pack.
 *
 * Why hand-rolled instead of a UI library? The editor renderer is
 * sandbox+contextIsolation locked down — every imported package has
 * to clear the CSP. A 100-line `<dialog>` wrapper is easier to audit
 * than a dependency.
 *
 * Each picker calls `openCellPicker(...)`, etc., which:
 *   1. Builds a `<dialog>` with the appropriate form fields
 *   2. Awaits user submission OR cancel
 *   3. Runs the form-state through the matching `validate*` from
 *      `directive-pickers.ts`
 *   4. Resolves with `InsertionPayload | null`
 *
 * The renderer entry-point then calls
 * `pane.insertDirective(payload)` to splice it.
 */
import {
  validateCell,
  validateInclude,
  validateFig,
  validateCite,
  validateAssetPointer,
  type CellFormState,
  type IncludeFormState,
  type FigFormState,
  type CiteFormState,
  type AssetPointerFormState,
  type ValidationResult,
} from "./directive-pickers.js";
import type {
  InsertionPayload,
  LabeledKind,
  AssetPointerKind,
} from "./directive-insert.js";

interface FieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  value?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}

interface ModalSpec {
  title: string;
  fields: ReadonlyArray<FieldDef>;
  submitLabel: string;
}

/**
 * Open a modal with the given form schema. Returns the form values
 * keyed by `field.name`, or `null` on cancel. The caller is
 * responsible for validating + re-prompting on validation failure
 * (the modal calls `onSubmit` with the raw form state and only
 * dismisses on a non-error result).
 */
function openModal<T>(
  host: HTMLElement,
  spec: ModalSpec,
  onSubmit: (values: Record<string, string>) => { ok: true; result: T } | { ok: false; field: string; message: string },
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "directive-modal";
    dialog.innerHTML = `
      <form method="dialog">
        <h3 class="directive-modal-title"></h3>
        <div class="directive-modal-fields"></div>
        <p class="directive-modal-error" hidden></p>
        <div class="directive-modal-actions">
          <button type="button" value="cancel" class="cancel-btn">Cancel</button>
          <button type="submit" value="submit" class="submit-btn"></button>
        </div>
      </form>
    `;
    const titleEl = dialog.querySelector(".directive-modal-title") as HTMLElement;
    const fieldsEl = dialog.querySelector(".directive-modal-fields") as HTMLElement;
    const errorEl = dialog.querySelector(".directive-modal-error") as HTMLElement;
    const submitBtn = dialog.querySelector(".submit-btn") as HTMLButtonElement;
    const cancelBtn = dialog.querySelector(".cancel-btn") as HTMLButtonElement;
    const form = dialog.querySelector("form")!;
    titleEl.textContent = spec.title;
    submitBtn.textContent = spec.submitLabel;

    const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
    for (const field of spec.fields) {
      const wrap = document.createElement("label");
      wrap.className = "directive-modal-field";
      const labelText = document.createElement("span");
      labelText.textContent = field.label;
      wrap.appendChild(labelText);
      let input: HTMLInputElement | HTMLSelectElement;
      if (field.type === "select" && field.options) {
        input = document.createElement("select");
        for (const opt of field.options) {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        }
      } else {
        input = document.createElement("input");
        input.type = field.type;
      }
      input.name = field.name;
      if (field.value != null) input.value = field.value;
      if (field.placeholder && input instanceof HTMLInputElement) {
        input.placeholder = field.placeholder;
      }
      wrap.appendChild(input);
      fieldsEl.appendChild(wrap);
      inputs[field.name] = input;
    }

    const cleanup = (value: T | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      cleanup(null);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const values: Record<string, string> = {};
      for (const [name, input] of Object.entries(inputs)) values[name] = input.value;
      const result = onSubmit(values);
      if (result.ok) {
        cleanup(result.result);
      } else {
        errorEl.hidden = false;
        errorEl.textContent = result.message;
        const offending = inputs[result.field];
        if (offending) offending.focus();
      }
    });

    host.appendChild(dialog);
    dialog.showModal();
    // Focus the first field for keyboard-only users.
    (Object.values(inputs)[0] as HTMLElement | undefined)?.focus();
  });
}

// ---------------------------------------------------------------------------
// Cell picker
// ---------------------------------------------------------------------------

export function openCellPicker(host: HTMLElement): Promise<InsertionPayload | null> {
  return openModal<InsertionPayload>(
    host,
    {
      title: "Insert code cell",
      submitLabel: "Insert ::cell",
      fields: [
        {
          name: "language",
          label: "Language",
          type: "select",
          value: "python",
          options: [
            { value: "python", label: "Python" },
            { value: "r", label: "R" },
            { value: "julia", label: "Julia" },
            { value: "javascript", label: "JavaScript" },
          ],
        },
        { name: "kernel", label: "Kernel", type: "text", value: "python3" },
        { name: "executionCount", label: "Execution count (optional)", type: "number" },
      ],
    },
    (v) => {
      const state: CellFormState = {
        language: v.language,
        kernel: v.kernel,
        executionCount: v.executionCount.trim() === "" ? null : Number(v.executionCount),
      };
      return resolvePayload(validateCell(state));
    },
  );
}

// ---------------------------------------------------------------------------
// Include picker
// ---------------------------------------------------------------------------

export function openIncludePicker(
  host: HTMLElement,
  archiveEntries: ReadonlyArray<string> | null,
): Promise<InsertionPayload | null> {
  return openModal<InsertionPayload>(
    host,
    {
      title: "Insert include",
      submitLabel: "Insert ::include",
      fields: [
        { name: "target", label: "Target path", type: "text", placeholder: "snippets/intro.md" },
        { name: "fragment", label: "Fragment (optional)", type: "text" },
        { name: "contentHash", label: "Content hash (optional)", type: "text" },
      ],
    },
    (v) => {
      const state: IncludeFormState = {
        target: v.target,
        fragment: v.fragment || undefined,
        contentHash: v.contentHash || undefined,
      };
      return resolvePayload(validateInclude(state, archiveEntries));
    },
  );
}

// ---------------------------------------------------------------------------
// Fig picker
// ---------------------------------------------------------------------------

export function openFigPicker(
  host: HTMLElement,
  existingIds: { fig: ReadonlySet<string>; eq: ReadonlySet<string>; tab: ReadonlySet<string> },
): Promise<InsertionPayload | null> {
  return openModal<InsertionPayload>(
    host,
    {
      title: "Insert labeled directive",
      submitLabel: "Insert",
      fields: [
        {
          name: "kind",
          label: "Kind",
          type: "select",
          value: "fig",
          options: [
            { value: "fig", label: "Figure (::fig)" },
            { value: "eq", label: "Equation (::eq)" },
            { value: "tab", label: "Table (::tab)" },
          ],
        },
        { name: "id", label: "ID", type: "text", placeholder: "overview" },
      ],
    },
    (v) => {
      const state: FigFormState = { kind: v.kind as LabeledKind, id: v.id };
      return resolvePayload(validateFig(state, existingIds));
    },
  );
}

// ---------------------------------------------------------------------------
// Cite picker
// ---------------------------------------------------------------------------

export function openCitePicker(
  host: HTMLElement,
  bibliographyKeys: ReadonlySet<string> | null,
): Promise<InsertionPayload | null> {
  return openModal<InsertionPayload>(
    host,
    {
      title: "Insert citation",
      submitLabel: "Insert ::cite",
      fields: [
        {
          name: "keys",
          label: "Citation keys (comma-separated)",
          type: "text",
          placeholder: "smith2020,jones2019",
        },
        { name: "prefix", label: "Prefix (optional)", type: "text", placeholder: "see" },
        { name: "suffix", label: "Suffix (optional)", type: "text", placeholder: "p. 42" },
      ],
    },
    (v) => {
      const state: CiteFormState = {
        keys: v.keys.split(",").map((k) => k.trim()).filter(Boolean),
        prefix: v.prefix || undefined,
        suffix: v.suffix || undefined,
      };
      return resolvePayload(validateCite(state, bibliographyKeys));
    },
  );
}

function resolvePayload(
  v: ValidationResult,
): { ok: true; result: InsertionPayload } | { ok: false; field: string; message: string } {
  return v.ok
    ? { ok: true, result: v.payload }
    : { ok: false, field: v.field, message: v.message };
}

// ---------------------------------------------------------------------------
// Non-core asset-pointer pickers (Phase 2.3b.7)
//
// One generic dispatcher per kind; the differences between
// `::video` and `::audio` (etc.) are just labels and which extra
// brace attributes are exposed in the modal. Centralising the
// schema keeps the toolbar wiring uniform.
// ---------------------------------------------------------------------------

interface KindSpec {
  title: string;
  placeholder: string;
  /** Extra brace attributes for the kind (besides `src`). */
  extraFields: ReadonlyArray<FieldDef>;
}

const KIND_SPECS: Record<AssetPointerKind, KindSpec> = {
  video: {
    title: "Insert video",
    placeholder: "assets/video/intro.mp4",
    extraFields: [
      { name: "poster", label: "Poster image (optional)", type: "text", placeholder: "assets/images/poster.jpg" },
      { name: "caption", label: "Caption (optional)", type: "text" },
    ],
  },
  audio: {
    title: "Insert audio",
    placeholder: "assets/audio/clip.mp3",
    extraFields: [{ name: "caption", label: "Caption (optional)", type: "text" }],
  },
  model: {
    title: "Insert 3D model",
    placeholder: "assets/models/scene.glb",
    extraFields: [
      { name: "caption", label: "Caption (optional)", type: "text" },
      { name: "background", label: "Background color (optional)", type: "text", placeholder: "#202020" },
    ],
  },
  embed: {
    title: "Insert embedded document",
    placeholder: "assets/documents/paper.pdf",
    extraFields: [
      { name: "caption", label: "Caption (optional)", type: "text" },
      { name: "page", label: "Page (optional)", type: "number" },
    ],
  },
  data: {
    title: "Insert data visualization",
    placeholder: "assets/data/series.csv",
    extraFields: [
      {
        name: "type",
        label: "Chart type",
        type: "select",
        value: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "bar", label: "Bar" },
          { value: "scatter", label: "Scatter" },
          { value: "table", label: "Table" },
        ],
      },
      { name: "caption", label: "Caption (optional)", type: "text" },
    ],
  },
};

export function openAssetPointerPicker(
  host: HTMLElement,
  kind: AssetPointerKind,
  archiveEntries: ReadonlyArray<string> | null,
): Promise<InsertionPayload | null> {
  const spec = KIND_SPECS[kind];
  return openModal<InsertionPayload>(
    host,
    {
      title: spec.title,
      submitLabel: `Insert ::${kind}`,
      fields: [
        { name: "src", label: "Source path", type: "text", placeholder: spec.placeholder },
        ...spec.extraFields,
      ],
    },
    (v) => {
      const attrs: Record<string, string> = {};
      for (const field of spec.extraFields) attrs[field.name] = v[field.name] ?? "";
      const state: AssetPointerFormState = { src: v.src, attrs };
      return resolvePayload(validateAssetPointer(kind, state, archiveEntries));
    },
  );
}
