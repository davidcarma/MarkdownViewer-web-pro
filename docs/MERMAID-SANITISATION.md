# Mermaid sanitisation (Markdown Pro)

How the preview turns LLM-heavy Mermaid source into SVG **without** unnecessary parse failures, and how this repo aligns with the same ideas used in the RAG query UI.

## Problem statement

Models often emit Mermaid that breaks parsers or older lexers:

| Failure class | Example | Why it breaks |
|---|---|---|
| Unicode arrows | `A ⟶ B`, `A → B` | Parser expects ASCII `-->` |
| Smart quotes | `A["Submit"]` (curly quotes) | Parser expects straight `"` |
| Bare special chars | `A[Article 72(3)]` | Parentheses parsed as shape syntax |
| Ampersands | `A["Feedback & Notes"]` | `&` in labels can break SVG or parsing |
| Forward slashes | `A["Screening / Review"]` | `/` can confuse some lexer paths |
| Trailing semicolons | `A --> B;` | Edge-case parse issues |
| Reserved node IDs | `end`, `class`, `style`, … | Keyword clashes |
| Parentheses in edge labels | `-->|No (see case)|` | Parser misreads |
| Em/en dashes | em dash where ASCII `--` was meant | Not the same token as hyphen-minus |

## Defence layers in this project

### Layer 1: Normalisation and LLM-oriented pass (`js/core.js`)

Before render, `sanitizeMermaidCode()` runs (in order):

1. Security stripping (`<script>`, `<style>`), `<br/>` → `<br>`, newlines, trim
2. Merge broken multi-line `style` rows (see `_mergeBrokenMermaidStyleLines`)
3. **Unicode normalisation** (same idea as RAG `UNICODE_ARROW_MAP`): arrows, em/en dash, smart quotes → ASCII
4. **Per-line LLM pass** (`_applyMermaidLLMLineSanitize`): skip diagram declaration and `%%` lines; strip trailing `;`; auto-quote bare `id[...]`, `id{...}`, `id(...)` when labels hold risky characters; escape raw `&` inside already-quoted square or curly labels as `#amp;` (Mermaid HTML entity style)
5. State diagram: `style` → `classDef` / `class` where needed
6. Flowchart / state line helpers: edge labels, cylinder/stadium guard so `id[("Database")]` is **not** rewritten into invalid `["("Database")"]`

### Layer 2: Aggressive retry (render time)

If `mermaid.render` fails on the fully sanitised source, `_aggressiveSanitizeMermaid()` runs (RAG-style): `&` → `and` inside quoted labels, strip `<` `>` in those labels, truncate very long quoted labels, strip parentheses inside pipe edge labels. Then a **second** `mermaid.render` attempt runs.

### Layer 3: Error UI

If both attempts fail, the existing preview shows the parse error, expandable source, and link to Mermaid Live Editor.

## Mermaid build

Vendored bundle: `lib/mermaid.min.js` (no CDN). Initialise via `updateMermaidTheme()` / `mermaid.initialize(...)`. Rendering uses `mermaid.render(id, text)` (async, Promise-based errors).

## Parity with the RAG project

The RAG app documents the same failure classes and uses `public/js/queryUI.js` (`sanitizeMermaidSource`, `aggressiveSanitize`, two render attempts). Markdown Pro ports that behaviour into `MarkdownEditor` so documents that render in the RAG UI are much more likely to render here too, while keeping Markdown-only extras (style-line merge, stateDiagram `style` conversion, cylinder guard).

## Hand-written safe diagrams

Prefer:

- ASCII arrows only: `-->`, `---`, `-.->`
- Quoted labels: `A["Short label"]`
- `and` instead of `&` in labels when unsure
- Edge labels in pipes with quotes when needed: `-->|"Yes"|`
- Avoid reserved words as bare IDs (`end`, `class`, `style`, …)

## Updating the vendored Mermaid file

Replace `lib/mermaid.min.js` with a new UMD build from the same major line you use elsewhere, then smoke-test flowcharts and sequence diagrams in the preview. Keep offline-first: do not switch to CDN loading.
