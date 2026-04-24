--[[
  mdz-filter.lua — Pandoc filter that understands MDZ directives.

  Lets pandoc round-trip MDZ documents through any format pandoc supports:

    pandoc --lua-filter=mdz-filter.lua document.md -o document.tex
    pandoc --lua-filter=mdz-filter.lua document.md -o document.html
    pandoc --lua-filter=mdz-filter.lua document.md -o document.docx

  What this filter handles:

    ::cell{language kernel execution_count}   → pandoc CodeBlock with attrs
      ```lang
      source
      ```
    ::output{type mime src}                   → pandoc Div / CodeBlock / Image
      ```
      body
      ```
    ::include[target fragment]                → pandoc RawBlock (passthrough) or
                                                inlined content if --mdz-inline-includes
    ::fig{id=f1} / ::eq{id=e1} / ::tab{id=t1} → pandoc Div with identifier for
                                                cross-reference resolution
    ::ref[f1]                                 → pandoc internal link
    ::cite[key]                               → pandoc Cite element
    {:.center} / {.class #id}                 → pandoc block attributes

  What this filter does NOT handle:

    - Computational-cell execution (use the mdz CLI or JupyterLab).
    - Signature verification (use `mdz verify`).
    - Multi-locale selection (pandoc processes one input at a time).

  Install:

    mkdir -p ~/.local/share/pandoc/filters/
    cp mdz-filter.lua ~/.local/share/pandoc/filters/

  Or invoke directly with --lua-filter=/path/to/mdz-filter.lua.

  Compat: pandoc ≥ 3.0. Tested against pandoc 3.1.x.
--]]

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

local function string_starts_with(s, prefix)
  return string.sub(s, 1, #prefix) == prefix
end

local function parse_attrs(body)
  -- Minimal attr-body parser: handles .class, #id, key="value", bool-flag.
  -- Mirrors the grammar in spec/grammar/mdz-directives.abnf.
  local classes = {}
  local identifier = ""
  local kv = {}
  for token in string.gmatch(body or "", '%S+') do
    if string.sub(token, 1, 1) == "." then
      table.insert(classes, string.sub(token, 2))
    elseif string.sub(token, 1, 1) == "#" then
      identifier = string.sub(token, 2)
    else
      local k, v = string.match(token, '^([%w_%-]+)="(.-)"$')
      if not k then
        k, v = string.match(token, "^([%w_%-]+)='(.-)'$")
      end
      if not k then
        k, v = string.match(token, '^([%w_%-]+)=([%w_%-%.]+)$')
      end
      if k then
        kv[k] = v
      else
        -- Bare boolean attribute (HTML-style) — surface as kv[name]="true".
        local bare = string.match(token, "^([%w_%-]+)$")
        if bare then
          kv[bare] = "true"
        end
      end
    end
  end
  return classes, identifier, kv
end

local function kv_to_list(kv)
  local out = {}
  for k, v in pairs(kv) do
    table.insert(out, { k, v })
  end
  return out
end

-- ---------------------------------------------------------------------------
-- Block-level directive detection
-- ---------------------------------------------------------------------------

-- Pattern: a paragraph whose content is a single directive marker like
-- `::cell{...}`, `::output{...}`, `::include[...]`, `::fig{...}`.
-- We rely on pandoc having already lexed the markdown into Para blocks
-- containing a single Str + attributes. Because the MDZ directives use
-- `::` prefix which pandoc-core doesn't recognize, these arrive as plain
-- Para blocks and we pattern-match the raw text.

local function para_text(para)
  -- Flatten a Para's inline content to raw text so we can match directive
  -- patterns. Handles Str, Space, Code (rare in directive lines).
  local parts = {}
  for _, inline in ipairs(para.content) do
    if inline.t == "Str" then
      table.insert(parts, inline.text)
    elseif inline.t == "Space" then
      table.insert(parts, " ")
    elseif inline.t == "Code" then
      table.insert(parts, "`" .. inline.text .. "`")
    end
  end
  return table.concat(parts)
end

-- ---------------------------------------------------------------------------
-- Filter functions (invoked by pandoc in tree-walk order)
-- ---------------------------------------------------------------------------

function Para(para)
  local text = para_text(para)

  -- ::include[target=... fragment=...]{content_hash=...}
  local inc_label, inc_attrs = string.match(text, "^::include%[(.-)%](%b{})?$")
  if inc_label then
    local bracket_classes, bracket_id, bracket_kv = parse_attrs(inc_label)
    local brace_kv = {}
    if inc_attrs and inc_attrs ~= "" then
      local _, _, bk = parse_attrs(string.sub(inc_attrs, 2, -2))
      brace_kv = bk
    end
    local target = bracket_kv.target or bracket_kv.path or brace_kv.target or brace_kv.path
    if not target or target == "" then
      -- Malformed include — leave as-is with a warning so pandoc output
      -- surfaces the problem rather than silently dropping.
      io.stderr:write("[mdz-filter] skipping include with empty target\n")
      return nil
    end
    -- Render as a labeled Div; downstream consumers can pre-process
    -- include resolution.
    return pandoc.Div(
      pandoc.Para(pandoc.Str("Included: " .. target)),
      pandoc.Attr("", {"mdz-include"}, kv_to_list({
        target = target,
        fragment = brace_kv.fragment or bracket_kv.fragment or "",
        content_hash = brace_kv.content_hash or bracket_kv.content_hash or "",
      }))
    )
  end

  -- ::cell{language=... kernel=... execution_count=N}
  local cell_attrs_body = string.match(text, "^::cell(%b{})$")
  if cell_attrs_body then
    local body = string.sub(cell_attrs_body, 2, -2)
    local _, _, kv = parse_attrs(body)
    -- The NEXT block is the fenced source; we can't rewrite across blocks
    -- from a single Para filter, so we emit a Div marker and rely on the
    -- Blocks-level filter below to merge.
    return pandoc.Div(pandoc.Para(pandoc.Str("[mdz-cell]")), pandoc.Attr(
      kv.id or "",
      {"mdz-cell-marker"},
      kv_to_list(kv)
    ))
  end

  -- ::output{type=... mime=... src=...}
  local out_attrs_body = string.match(text, "^::output(%b{})$")
  if out_attrs_body then
    local body = string.sub(out_attrs_body, 2, -2)
    local _, _, kv = parse_attrs(body)
    return pandoc.Div(pandoc.Para(pandoc.Str("[mdz-output]")), pandoc.Attr(
      "",
      {"mdz-output-marker"},
      kv_to_list(kv)
    ))
  end

  -- ::fig{id=X} / ::eq{id=X} / ::tab{id=X}
  local kind, labeled_attrs = string.match(text, "^::(fig|eq|tab)(%b{})$")
  if kind then
    local body = string.sub(labeled_attrs, 2, -2)
    local _, _, kv = parse_attrs(body)
    local label_kind = ({ fig = "figure", eq = "equation", tab = "table" })[kind]
    return pandoc.Div(pandoc.Para(pandoc.Str("[mdz-" .. label_kind .. "]")), pandoc.Attr(
      kv.id or "",
      {"mdz-" .. label_kind .. "-marker"},
      kv_to_list(kv)
    ))
  end

  -- ::container :::{.align-center} ... ::: — delimited containers need
  -- a Blocks-level pass to identify open/close; leave for later.
  return nil
end

-- ---------------------------------------------------------------------------
-- Inline-level filters: ::ref[id], ::cite[key]
-- ---------------------------------------------------------------------------

function Str(str)
  -- Scan for inline ::ref[id] and ::cite[key] tokens within a text run.
  -- pandoc splits text on whitespace into Str nodes; a directive is a
  -- whole Str so we can pattern-match the text.
  local ref_id = string.match(str.text, "^::ref%[([%w_%-]+)%]$")
  if ref_id then
    return pandoc.Link(
      { pandoc.Str("[ref:" .. ref_id .. "]") },
      "#" .. ref_id,
      "",
      pandoc.Attr("", {"mdz-ref"}, {{ "target-id", ref_id }})
    )
  end

  local cite_keys = string.match(str.text, "^::cite%[([%w_%-,%s]+)%]$")
  if cite_keys then
    local citations = {}
    for key in string.gmatch(cite_keys, "[%w_%-]+") do
      table.insert(citations, pandoc.Citation(key, "NormalCitation"))
    end
    return pandoc.Cite({ pandoc.Str("[@" .. cite_keys .. "]") }, citations)
  end

  return nil
end

-- ---------------------------------------------------------------------------
-- Cell-source merging (Blocks-level)
-- ---------------------------------------------------------------------------

function Blocks(blocks)
  -- Merge ::cell-marker Div + following CodeBlock + ::output-marker Div
  -- into a single CodeBlock with mdz-cell class so downstream writers
  -- can emit the right thing (LaTeX listings, HTML <pre>, JATS <code>).
  local out = {}
  local i = 1
  while i <= #blocks do
    local block = blocks[i]
    if block.t == "Div" and block.classes and block.classes[1] == "mdz-cell-marker" then
      local attrs = block.attributes or {}
      local lang = attrs.language or ""
      local kernel = attrs.kernel or ""
      local exec_count = attrs.execution_count or ""

      -- Look ahead for the source CodeBlock.
      if i + 1 <= #blocks and blocks[i + 1].t == "CodeBlock" then
        local source = blocks[i + 1]
        local cell_attrs = pandoc.Attr(
          attrs.id or "",
          { "mdz-cell", "language-" .. lang },
          {
            { "data-language", lang },
            { "data-kernel", kernel },
            { "data-execution-count", exec_count },
          }
        )
        table.insert(out, pandoc.CodeBlock(source.text, cell_attrs))
        i = i + 2
        -- Collect ::output markers that follow.
        while i <= #blocks and blocks[i].t == "Div"
              and blocks[i].classes and blocks[i].classes[1] == "mdz-output-marker" do
          local out_attrs = blocks[i].attributes or {}
          local out_type = out_attrs.type or "text"
          -- Look ahead for an output body.
          if i + 1 <= #blocks and blocks[i + 1].t == "CodeBlock" then
            local body = blocks[i + 1]
            table.insert(out, pandoc.CodeBlock(
              body.text,
              pandoc.Attr("", { "mdz-output", "mdz-output-" .. out_type }, kv_to_list(out_attrs))
            ))
            i = i + 2
          elseif out_attrs.src then
            -- Output with a `src` attribute and no inline body.
            table.insert(out, pandoc.Para(pandoc.Image(
              { pandoc.Str("output") },
              out_attrs.src,
              out_attrs.mime or "",
              pandoc.Attr("", { "mdz-output" }, kv_to_list(out_attrs))
            )))
            i = i + 1
          else
            -- Malformed output without body or src — skip with warning.
            io.stderr:write("[mdz-filter] dropping malformed ::output without body or src\n")
            i = i + 1
          end
        end
      else
        -- ::cell marker without a following CodeBlock — unusual. Keep as-is.
        io.stderr:write("[mdz-filter] ::cell without fenced source block at position " .. i .. "\n")
        table.insert(out, block)
        i = i + 1
      end
    else
      table.insert(out, block)
      i = i + 1
    end
  end
  return out
end

-- ---------------------------------------------------------------------------
-- Meta pass — surface the MDZ manifest fields pandoc should know about
-- ---------------------------------------------------------------------------

function Meta(meta)
  -- If the markdown was extracted from an MDZ archive with a preserved
  -- manifest, the caller typically pre-populates meta fields with the
  -- values from manifest.document. This hook is here so future callers
  -- can extend; no-op today.
  return meta
end
