# System Reference (Markdown Pro)

This document is the **source of truth** for how Markdown Pro works today: architecture, invariants, storage, rendering pipeline, and the “hard rules” that must not regress.

## Hard requirements (do not break)

- **Offline-first**: the app must work with **zero network access**.
- **No external runtime dependencies**: no `http(s)://` in `<script src>`, `<link href>`, or CSS `@import`.
- **Vendored libraries only**: any runtime third‑party lib must live in this repo and be loaded via relative paths.

Enforcement:
- **`check-deployment.sh`** fails if external runtime assets are detected.

## Boot sequence (what runs first)

- **HTML loads vendored libs** (all `defer`): `markdown-it`, `highlight.js`, `mermaid`, `katex`, `mammoth`, etc. (`index.html`)
- **App modules load** (`defer`): storage/IndexedDB managers, then `core.js`, then UI modules, then `app.js`.
- **`js/app.js`** constructs `window.markdownEditor = new MarkdownEditor()` and wires modules:
  - `FileBrowser`, `EditorEvents`, `PaneResizer`
  - image paste, image collapse, syntax overlay, drag/drop

## Rendering pipeline (editor → preview)

### Parser

- **Primary markdown renderer**: **`markdown-it`** with source line tracking.
- The renderer attaches **`data-line`** and **`data-line-end`** attributes to **leaf block elements** (paragraphs, headings, fences, etc.) so scroll sync can map source → rendered position.
- **`marked.min.js`** is still shipped/loaded but is not the primary preview renderer; keep it only if used by legacy/export paths.

### Post-processing (preview)

After markdown is rendered to HTML, `js/core.js` applies:
- **Syntax highlighting** via `highlight.js` (best effort). Note: highlight may log security warnings for unescaped HTML inside code blocks; this is informational.
- **Mermaid**: code fences tagged `mermaid` are replaced by rendered diagrams.
  - **Invariant**: when mermaid replaces DOM nodes, the diagram container **must preserve** `data-line` / `data-line-end` copied from the original block, otherwise scroll sync drifts.
- **KaTeX**: math rendering via `katex-auto-render` (if configured/used).

## Scroll synchronization (current design)

### Directionality

- **One-way sync (editor → preview)**: scrolling the editor drives the preview. Preview scrolling is independent.

### Goals / invariants

- **Stable**: no jitter feedback loops, no bounce at the ends.
- **Deterministic**: top-of-editor content should correspond to top-of-preview content as closely as possible.
- **Robust with wraps**: editor uses `white-space: pre-wrap`; **wrapped lines must not break mapping**.

### Implementation (high level)

Implemented in `js/core.js` (`_onScroll()` → `_performSync()`):

- **Throttle**: one sync per animation frame.
- **Typing suppression**: ignore scroll sync briefly after input to avoid “typing scrolls the page”.
- **Edge snapping**: when editor hits top/bottom, snap preview to top/bottom.
- **Content-based mapping**:
  - Compute the editor’s **top logical line** + fractional progress.
  - Build a `lineMap` from preview elements carrying `data-line`/`data-line-end` (leaf blocks only).
  - If top line falls **within** a block range, scroll proportionally within that block’s rendered height.
  - If top line falls **between** blocks, interpolate through the pixel gap.

### Wrap-aware editor top-line mapping (critical)

The editor textarea wraps lines (`pre-wrap`), so **`scrollTop / lineHeight` is wrong** on complex documents.

Fix: `js/core.js` builds an offscreen **mirror** of the textarea (same width/font/padding/wrapping) with per-line markers to compute:
- `topLineInt`: top logical line (1-based)
- `lineFraction`: fractional progress into that logical line

### Debugging scroll sync

Enable detailed logs:

- Set `localStorage.setItem('markdownpro-debug-scroll', '1')`
- Reload and scroll; logs show mapping mode and chosen elements.
- Disable with `localStorage.removeItem('markdownpro-debug-scroll')`

## Storage & persistence

### Storage layers

- **IndexedDB (primary)**: durable storage for multiple files + large documents.
  - Files store: `markdown-editor-db` / store `files`
  - Images store: `markdown-editor-db` / store `images` (for offline image placeholder expansion)
- **localStorage (secondary / compatibility buffer)**:
  - Used for small docs and metadata; **large docs and embedded images are intentionally not stored** to avoid quota errors.

### Auto-save semantics

- Editor input triggers `autoSave()` in `js/core.js`.
- **IndexedDB auto-save is debounced** (roughly 1s after last change) through the file browser’s save routine.
- localStorage is written only when content is small and does not contain large embedded images.

### Migration semantics (localStorage → IndexedDB)

- Migration is **non-destructive by default**: `loadSavedFile()` calls `migrateLocalStorageToIndexedDB(false)` and does **not** clear localStorage.
- To force a cleanup pass that clears localStorage after migration:
  - Use the console helper: `migrateToIndexedDB(true)` (exposed by `js/app.js`)

### Backup / Restore (recommended before clearing site data)

The Settings modal provides:
- **Export Backup**: downloads a JSON file containing:
  - localStorage payload
  - IndexedDB files
  - IndexedDB images (needed to restore embedded-image placeholders)
- **Import Backup**: restores the JSON into localStorage + IndexedDB, then reloads the most recent file.

Implementation:
- `MarkdownEditor.exportData()` / `MarkdownEditor.importData()` in `js/core.js`
- UI wiring in `js/events.js`

## Embedded images (“magic hiding”)

### Goals / invariants

- Keep the editor readable by collapsing very large `data:image/...` URLs into placeholders.
- Must remain **offline-safe**: preview must **never** try to fetch `/...IMG_...` over the network.
- Must survive refresh: placeholders can be expanded back to the original data URL.

### How it works

`js/simple-image-collapse-v2.js`:
- When collapsing, replaces data URLs with placeholders: `![alt](...IMG_... )`
- Stores `{id, alt, dataUrl}` in:
  - in-memory `Map` for the current session
  - **IndexedDB images store** for persistence
- When expanding for preview/export:
  - expands placeholders back into `data:image/...` URLs
  - if an image id is missing, replaces it with a **data: SVG “missing image”** marker (never a network URL)

On load:
- `loadReferencedImagesFromIndexedDB(content)` populates the in-memory map so placeholders expand correctly after refresh.

## Layout & “scroll runway” at end of document

To avoid “can’t scroll far enough to see the bottom” and to keep both panes aligned near EOF:
- Preview has extra bottom padding (`css/preview.css`)
- Editor has matching bottom padding (`css/editor.css`)

## Deployment checklist

- Run `./check-deployment.sh` and ensure it reports:
  - all vendored libs present
  - **no external runtime assets**
- Ensure you deploy **all** required files listed in the script output.

## Common failure modes (and the invariant they violate)

- **Preview doesn’t update on server but works on `file://`**:
  - Usually CSP + inline script issues; invariant is “all scripts loaded via static `<script src>`”.
- **`storage quota exceeded`**:
  - Means something attempted to write huge content to localStorage; invariant is “large docs/images must bypass localStorage”.
- **Images show as broken links / 404 `/...IMG_...`**:
  - Placeholder expansion failed; invariant is “unknown placeholders must become `data:` markers, never network URLs”.
- **Scroll drift on wrapped lines**:
  - Wrap-aware mapping missing/broken; invariant is “textarea mirror must be used for top-line mapping”.


