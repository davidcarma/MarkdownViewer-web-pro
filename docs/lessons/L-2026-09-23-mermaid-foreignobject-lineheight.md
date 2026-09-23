# L-2026-09-23-mermaid-foreignobject-lineheight

- **ID:** L-2026-09-23-mermaid-foreignobject-lineheight
- **Date:** 2026-09-23
- **Tags:** ui, mermaid, preview, silent-failure, high, lesson
- **Severity:** high
- **Error class:** Host CSS `line-height` cascades into Mermaid `foreignObject` HTML labels and clips node text
- **Rule (do not repeat):** Never let `.mermaid-inner { line-height: 0 }` (or page unitless line-height) cascade into Mermaid label HTML. Reset `line-height: normal` on `.mermaid-diagram foreignObject` and label containers. Prefer `useMaxWidth: false` when the host owns fit scaling.

## Incident (example only)

Identity-store flowchart nodes showed only the bottom of each label; text looked vertically clipped inside light-blue boxes.

## Root cause

`.mermaid-inner { line-height: 0 }` (for SVG transform layout) plus inherited host line-height made HTML labels paint at a different height than Mermaid measured when sizing nodes. Combined with Mermaid 10.x and `useMaxWidth: true`.

## Fix

- Vendor Mermaid 11.17.2
- Host config: `useMaxWidth: false`, root `htmlLabels` / `markdownAutoWrap`
- CSS: reset foreignObject / nodeLabel line-height to `normal`; set `overflow: visible` on foreignObjects after render
- Stop collapsing `\n` to spaces in `_stripMermaidUnsafe`

## How to detect this in the future

Open `test/mermaid-identity-store.md`. If any node label is cut at the top or bottom of its box, re-check foreignObject computed `line-height` in DevTools (must be `normal`, not `0` or a cascaded unitless multiplier).

## Related lessons

- L-2026-09-01-mermaid-percent-width-height
