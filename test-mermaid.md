# Mermaid Export Test

This document tests Mermaid diagram export functionality.

## Simple Flowchart

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    participant Carol
    
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Bob->>Carol: How about you Carol?
    Carol-->>Bob: I'm good thanks!
```

## Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Development
    Design         :done,    des1, 2024-01-01, 2024-01-07
    Implementation :active,  dev1, 2024-01-08, 2024-01-21
    Testing        :         test1, after dev1, 1w
    section Deployment
    Staging        :         stage1, after test1, 3d
    Production     :         prod1, after stage1, 2d
```

## Regular Content

This is regular markdown content that should also be exported correctly.

- List item 1
- List item 2
- List item 3

**Bold text** and *italic text* should work fine.

```javascript
// Code blocks should also work
function test() {
    console.log("Testing export functionality");
}
```
