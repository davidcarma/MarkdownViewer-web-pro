# L-2026-09-01-mermaid-percent-width-height

- **ID:** L-2026-09-01-mermaid-percent-width-height
- **Date:** 2026-09-01
- **Tags:** ui, mermaid, preview, silent-failure, medium, lesson
- **Severity:** medium
- **Error class:** SVG `width="100%"` parsed as 100px, so preview box height does not follow the diagram
- **Rule (do not repeat):** Never size a Mermaid viewport from `parseFloat(svg.getAttribute('width'))`. Use viewBox (or getBBox), ignore percentage attributes, then scale to the pane width and set height from that scaled content.

## Incident (example only)

Preview Mermaid cards kept full diagram width but left the wrong vertical box (empty space or a 120px floor) because Mermaid `useMaxWidth` sets `width="100%"` and omits height.

## Root cause

`js/core.js` `computeFitScale` treated `parseFloat("100%")` as 100. Combined with CSS `max-width: 100%` / `min-height: 120px`, the transform scale and viewport height were not the content aspect ratio.

## Fix

`_normalizeMermaidSvgSize` pins pixel width/height from viewBox/bbox. `sizeViewportToFit` sets viewport height to `naturalH * fitScale + padding` with no 120px floor.

## How to detect this in the future

A rendered `.mermaid-viewport` whose height is not `svg.getBoundingClientRect().height + vertical padding` (slack not ~0), or a zoom label of `100%` on a diagram whose SVG width attribute is `100%`.

## Related lessons

None yet.
