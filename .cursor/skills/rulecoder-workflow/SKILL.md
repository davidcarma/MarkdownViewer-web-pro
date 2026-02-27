---
name: rulecoder-workflow
description: Oracle-first development workflow for the Rulecoder MCP server. Use when the AI-prolog-rulecoder MCP is registered, when working with .rulecoder/ fact files, when the user mentions state machines, invariants, sm_ tools, or architectural modeling. Enforces privacy guardrails, tool usage order, and regression detection.
---

# Rulecoder MCP Workflow

## Privacy — Source Code Never Leaves the IDE

- The MCP server receives ONLY abstract Prolog atoms (e.g. `transition(auth_flow, idle, active)`).
- NEVER send source code, file contents, API keys, secrets, or business logic through MCP tool arguments.
- `sm_suggest_facts` analyzes source locally in your context window. Only `.pl` fact proposals reach the server.
- The Prolog engine never reads source code. It reasons over declared facts only.

## Oracle-First Protocol

Follow this order every session. Do not skip steps.

1. **Session start** — server auto-loads `.rulecoder/` on connect. Confirm with `sm_health`.
2. **Before any change** — call `sm_diagram` to visualise the current topology (show it to the user), then `sm_simulate_execution` to enumerate reachable paths, then `sm_diff` to capture current finding state.
3. **Model first, code second** — update `.rulecoder/*.pl` facts BEFORE writing implementation.
4. **Use guidance** — call `sm_predicate_guidance` before using any predicate. Never guess names or arities.
5. **Edit through tools** — use `sm_add_facts` (batch) / `sm_remove_fact` / `sm_init_machine`. Do not hand-edit `.pl` files.
6. **After change** — run `sm_diff` once. NEW unacknowledged findings = regression. Do not claim done.
7. **Baseline when clean** — `sm_baseline` snapshots findings as known-good.
8. **Acknowledge intentional findings** — `sm_expect` with ticket and expiry.

## Mutation Discipline — Plan Before You Touch

Before making ANY fact changes:

1. Call `sm_diagram` — visualise the current topology. **Show the diagram to the user.**
2. Call `sm_simulate_execution` — enumerate all reachable paths at current depth.
3. Write down ALL facts you intend to add or remove as a complete list.
4. Validate each structural change with `sm_propose_transition` (for state/transition changes).
5. Commit the entire batch with ONE `sm_add_facts` call (not repeated `sm_add_fact`).
6. Call `sm_diff` ONCE at the end. NEW findings = regression. Stop and reassess.

**Never do this:**
- `sm_add_fact` → `sm_check_invariants` → `sm_remove_fact` → `sm_add_fact` → repeat.
  This is reactive guessing. It wastes tokens, converges slowly, and produces noisy audit logs.

## Tool Reference

| Tool | When to use |
|------|-------------|
| `sm_health` | Start of session — verify server and loaded files |
| `sm_diagram` | Visualise a machine as a Mermaid stateDiagram — call before any mutation, show to user |
| `sm_simulate_execution` | Enumerate all reachable paths — use to plan changes, not just debug |
| `sm_audit` | Check encoding coverage — what's modeled, what's missing |
| `sm_report` | Full colorized findings report (RED/ORANGE/PURPLE/GREEN). Use `format=diagram` for Mermaid output |
| `sm_check_invariants` | Raw finding list for all invariant checks |
| `sm_diff` | Before and after every change — detect regressions |
| `sm_baseline` | Snapshot current findings as known-good |
| `sm_export_metrics` | Lean delta vs baseline (new + resolved only by default) |
| `sm_predicate_guidance` | Before using any predicate — find the right one |
| `sm_add_fact` / `sm_add_facts` | Add validated facts to `.pl` files. Prefer `sm_add_facts` (batch) |
| `sm_remove_fact` | Remove a fact (auto re-runs invariants) |
| `sm_init_machine` | Scaffold a new state machine |
| `sm_propose_transition` | Dry-run impact of a proposed change |
| `sm_suggest_facts` | Analyze source in context, get fact proposals |
| `sm_batch_check` | Run invariant checks for multiple machines in one call |
| `sm_load_plugin` | Load session-scoped custom Prolog rules |
| `sm_expect` | Suppress a known finding with ticket + expiry |
| `sm_query` | Ad-hoc Prolog query for debugging |

## Warnings

- **Do not invent predicates.** Always check `sm_predicate_guidance` or `sm_list_predicates` first.
- **Do not edit `knowledge/invariants.pl`.** Use `sm_suggest_invariant` to propose new rules.
- **Non-ground facts are rejected.** Facts with variables (`X`, `_`) or placeholders (`TODO`) are blocked.
- **Findings are structural, not runtime.** A "dead_end" is a graph node with no outgoing edge. Explain in graph terms.
- **Baseline tracks delta.** A known-broken baseline is valid. The system tracks new vs resolved, not absolute state.

## Architecture

- **Rules** ship with the server — universal, isomorphism-invariant, language-agnostic. Two machines with identical topology produce identical findings regardless of atom names or source language.
- **Facts** live in `.rulecoder/*.pl` — project-specific, contain no source code, describe structure only.
