# Knowledge Pipeline

# Purpose

Define the end-to-end transformation from evidence to approved reusable knowledge.

---

# Responsibilities

Clarify stage ownership, trust changes, versioning, failure behavior, and review gates.

---

# Architecture

```mermaid
flowchart LR
  U["Uploaded/acquired"] --> R["Rendering"]
  R --> C["Classification"]
  C --> X["Extraction"]
  X --> B["Building"]
  B --> V["Verification"]
  V --> L["Validation"]
  L --> H["Review"]
  H --> P["Publish approved knowledge"]
```

## Current Implementation

The stage vocabulary exists in advanced-import types. Workspace preparation implements upload/render completion; compatibility routes delegate actual calendar analysis/result to existing production routes. The diagram is otherwise future architecture.

## Future Vision

Stages persist versioned inputs/outputs or references sufficient for diagnosis and approved replay policy.

---

# Data Model

Current session stage/status exists. Per-stage runs, dependencies, attempts, outputs, and object publication are TODO.

---

# Processing Pipeline

Stages advance monotonically; failure is terminal in the current state service. Future retry semantics must distinguish a stage run/attempt from the overall session.

---

# Public Interfaces

TODO: coordinator, progress event, retry/cancel, stage executor, publication boundary.

---

# Internal Components

Pipeline coordinator, stage executors, state store, artifact/object registries, diagnostics.

---

# Future Enhancements

Parallel independent engines, partial recomputation, resumable attempts, impact-based re-verification.

---

# Open Questions

- Which stages may safely retry automatically?
- How are multi-engine dependencies represented?

---

# Testing Strategy

State-machine, idempotency, concurrency, retry, failure injection, progress, and compatibility tests.

---

# Notes

“Completed” should eventually mean published/accepted outcome, not merely model execution; exact semantics are TODO.

## Related documents

- [School Knowledge Session](../03-school-knowledge-session.md)
- [Knowledge Engine API](../06-knowledge-engine-api.md)
- [Data Flow](data-flow.md)
