# Mermaid visual QA: identity store flowchart

Primary fixture for Mermaid renderer fixes. Labels must be fully visible
(no top/bottom clip). Viewport height must hug the diagram.

```mermaid
flowchart LR
  browser[Browser]
  auth[Auth middleware]
  port[Identity port]
  sqlite[SQLite user file]
  futurePg[Later Postgres or user API]
  spaces[User space folders]
  live[Live sessions]
  codex[Platform Codex pool]
  telem[Existing telemetry]
  browser --> auth --> port
  port --> sqlite
  port -.-> futurePg
  auth --> spaces
  auth --> live
  live --> codex
  telem --> port
```

## Multi-line labels (newlines must survive)

```mermaid
flowchart TD
  A["Line one\nLine two"] --> B["Later Postgres\nor user API"]
  B --> C["Short"]
```
