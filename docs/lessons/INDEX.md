# Lessons index

## How to use

Grep this file for a tag (for example `mermaid`, `silent-failure`). Open only the matching detail file.

## Tag taxonomy

- **Subsystem:** `ui`, `mermaid`, `preview`, `auth`, `export`
- **Failure class:** `silent-failure`, `data-loss`, `performance`, `regression`, `wrong-answer`
- **Severity:** `critical`, `high`, `medium`, `low`
- **Doc type:** `lesson`, `constraint`, `gotcha`

## Lessons

| ID | Title | Tags | Severity | Date | File |
|----|-------|------|----------|------|------|
| L-2026-09-23-drive-duplicate-names | Drive uniqueness is the ID; never create a second same-name sibling | ui, auth, silent-failure, high, lesson | high | 2026-09-23 | [L-2026-09-23-drive-duplicate-names.md](L-2026-09-23-drive-duplicate-names.md) |
| L-2026-09-23-mermaid-foreignobject-lineheight | Host line-height must not cascade into Mermaid foreignObject labels | ui, mermaid, preview, silent-failure, high, lesson | high | 2026-09-23 | [L-2026-09-23-mermaid-foreignobject-lineheight.md](L-2026-09-23-mermaid-foreignobject-lineheight.md) |
| L-2026-09-01-mermaid-percent-width-height | Mermaid preview height must use viewBox, not parseFloat("100%") | ui, mermaid, preview, silent-failure, medium, lesson | medium | 2026-09-01 | [L-2026-09-01-mermaid-percent-width-height.md](L-2026-09-01-mermaid-percent-width-height.md) |

## Related external docs

- [SCRATCHPAD.md](../../SCRATCHPAD.md)
- [docs/MERMAID-SANITISATION.md](../MERMAID-SANITISATION.md)

## Adding a new lesson

Copy `_TEMPLATE.md`. Add a row here. Do not dump the full lesson into this index.
