# Mermaid Stress Test — Brittle Label Patterns

These diagrams reproduce the known parse-error patterns that break Mermaid's
parser. Every diagram below should render cleanly after the sanitizer fix.

---

## 1. stateDiagram-v2: Unquoted labels with slashes and colons

The classic failure: API paths like `DELETE /api/v2/jobs/:uuid` in transition labels.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> running : POST /api/v1/jobs
    running --> completed : GET /status/:id
    running --> failed : DELETE /api/v2/jobs/:uuid
    failed --> [*]
    completed --> [*]
```

## 2. stateDiagram-v2: Em-dashes, parentheses, and mixed punctuation

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> validating : pre-start check — validate config
    validating --> active : trigger(layer-engine.js:executeStack)
    active --> draining : awaits(db_connection)
    draining --> stopped : releases(lock) — cleanup complete
    stopped --> [*]
```

## 3. stateDiagram-v2: Embedded quotes in labels

```mermaid
stateDiagram-v2
    [*] --> init
    init --> ready : set flag "is_ready" to true
    ready --> processing : input contains 'special' chars
    processing --> done : output = "result"
    done --> [*]
```

## 4. stateDiagram-v2: Brackets, pipes, hashes, and structural chars

```mermaid
stateDiagram-v2
    [*] --> open
    open --> filtering : apply [filter] | sort
    filtering --> rendering : template #{id} rendered
    rendering --> closed : emit {event} <done>
    closed --> [*]
```

## 5. stateDiagram-v2: Semicolons and backslashes

```mermaid
stateDiagram-v2
    [*] --> start
    start --> middle : cmd1; cmd2; cmd3
    middle --> end : path\to\file
    end --> [*]
```

## 6. stateDiagram-v2: Already-quoted labels (should pass through unchanged)

```mermaid
stateDiagram-v2
    [*] --> a
    a --> b : "this is already quoted"
    b --> c : "quoted with /slashes: and (parens)"
    c --> [*]
```

## 7. Flowchart: Pipe-delimited edge labels with special chars

```mermaid
flowchart LR
    A[Start] -->|POST /api/users| B[Create User]
    B -->|validate(input)| C{Valid?}
    C -->|Yes — proceed| D[Save to DB]
    C -->|No — retry| A
    D -->|emit "saved" event| E[Done]
```

## 8. Flowchart: Node labels with double braces and nested parens

```mermaid
flowchart TD
    A[Config {{defaults}}] --> B[Process (step 1)]
    B --> C[Validate {{schema.v2}}]
    C --> D[Result (final output)]
```

## 9. Flowchart: Curly quotes and Unicode dashes in labels

```mermaid
flowchart LR
    X[Input] -->|"smart quotes"| Y[Parse]
    Y -->|step 1 – step 2| Z[Output]
```

## 10. EXACT RuleCoder output: job_lifecycle (from EVAL_V0_10_3)

This is the verbatim Mermaid from the production eval doc.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> cancelled : "releases(artifacts_dir), trigger(DELETE /api/v2/jobs/:uuid -- pre-start cancel)"
    pending --> running : "trigger(POST /api/v2/jobs -> jobs.js:handlePathSource/handleUploadSource)"
    running --> cancelled : "releases(artifacts_dir), trigger(layer-engine.js:executeStack -- CancelledError propagation)"
    running --> complete : "releases(artifacts_dir), trigger(layer-engine.js:executeStack -- jobManager.writeLog complete)"
    running --> failed : "releases(artifacts_dir), trigger(layer-engine.js:executeStack -- catch block)"
    pending --> failed : [error]
    running --> failed : [error]
    cancelled --> [*]
    complete --> [*]
    failed --> [*]
```

## 11. EXACT RuleCoder output: layer_pipeline (from EVAL_V0_10_3)

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> validating : "trigger(layer-engine.js:executeStack -- layer iteration loop start)"
    layer_complete --> pipeline_failed : "releases(python_worker), trigger(layer-engine.js:executeStack -- catch: artifact save throws)"
    layer_complete --> saving_artifacts : "releases(python_worker), trigger(layer-engine.js:executeStack -- jobManager.saveLayerArtifacts)"
    running_algorithm --> layer_complete : "releases(python_worker), trigger(layer-engine.js:executeStack -- algorithm processor resolves)"
    running_algorithm --> pipeline_failed : "releases(python_worker), trigger(layer-engine.js:executeStack -- catch: algorithm processor throws)"
    running_model --> layer_complete : "releases(python_worker), awaits(python_worker), awaits(ocr_worker), trigger(layer-engine.js:executeStack -- model processor resolves)"
    running_model --> pipeline_failed : "releases(python_worker), awaits(python_worker), awaits(ocr_worker), trigger(layer-engine.js:executeStack -- catch: model processor throws)"
    saving_artifacts --> pipeline_complete : "trigger(layer-engine.js:executeStack -- all layers done, writeLog complete)"
    saving_artifacts --> validating : "trigger(layer-engine.js:executeStack -- layers[i+1] exists)"
    validating --> pipeline_failed : "releases(python_worker), trigger(layer-engine.js:executeStack -- no processor found for layer)"
    validating --> running_algorithm : "trigger(layer-engine.js:executeStack -- processor.type=algorithm)"
    validating --> running_model : "acquires(python_worker), trigger(layer-engine.js:executeStack -- processor.type=model)"
    idle --> pipeline_failed : [error]
    layer_complete --> pipeline_failed : [error]
    running_algorithm --> pipeline_failed : [error]
    running_model --> pipeline_failed : [error]
    saving_artifacts --> pipeline_failed : [error]
    validating --> pipeline_failed : [error]
    pipeline_complete --> [*]
    pipeline_failed --> [*]
```

## 12. EXACT RuleCoder output: gpu_batcher (from EVAL_V0_10_3)

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> waiting_for_batch : "acquires(queue_slot), trigger(SharedModelBatcher.submit -- pending.append(req))"
    processing --> completed : "releases(queue_slot), trigger(SharedModelBatcher._process_detect_batch -- future.set_result)"
    waiting_for_batch --> processing : "releases(queue_slot), awaits(batch_execution), trigger(SharedModelBatcher.run -> _process_batch)"
    idle --> failed : [error]
    processing --> failed : [error]
    waiting_for_batch --> cancelled : [error]
    waiting_for_batch --> timeout : [error]
    cancelled --> [*]
    completed --> [*]
    failed --> [*]
    timeout --> [*]
```

---

## Expected Results

All 12 diagrams above should render as proper SVG diagrams with no red error
boxes. Labels may have minor character substitutions (e.g., `"` → `'`,
`—` → `-`, `/` → space, `:` → ` -`) but should remain readable.
