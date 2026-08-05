# School Knowledge Session

# Purpose

Define the tenant-scoped, auditable unit of work that turns sources into reviewed knowledge.

---

# Responsibilities

Own workflow/pipeline version, stage, status, actor, timestamps, artifacts, diagnostics, proposals, and review lineage.

---

# Architecture

## Current Implementation

`advanced_import_sessions` records school, user, workflow/pipeline versions, status, current stage, and timestamps. Service-role-only tables and server authorization guard access. Stages currently include upload through completion/failure, although only workspace preparation/render completion and compatibility delegation are implemented.

## Future Vision

The session becomes domain-agnostic and may contain multiple sources and engine runs. Retry, cancellation, expiration, and resume semantics are TODO.

---

# Data Model

Current entities: `advanced_import_sessions`, `advanced_import_artifacts`, `advanced_import_page_metadata`, and `advanced_import_diagnostics`. Proposed knowledge-object relationships are TODO.

---

# Processing Pipeline

State transitions are forward-only one stage at a time, except failure. Concurrent transition attempts fail rather than overwrite state.

---

# Public Interfaces

Current advanced-import routes create/poll/result sessions and a debug-only session inspection route. These are experimental, not stable external APIs.

---

# Internal Components

`ImportSessionService`, `PipelineStateService`, `ArtifactRegistryService`, storage, renderer, and diagnostics.

---

# Future Enhancements

TODO: idempotency keys, resumable engine runs, explicit cancellation, retention, and session-level review summary.

---

# Open Questions

- Can one session publish multiple domains atomically?
- What state survives connector credential loss?

---

# Testing Strategy

Test authorization, transition concurrency, terminal states, artifact cleanup, failure recovery, and school isolation.

---

# Notes

A session is not the School Knowledge Base; it is the evidence-bearing process that may propose updates to it.

## Related documents

- [Artifact Lifecycle](architecture/artifact-lifecycle.md)
- [Knowledge Pipeline](architecture/knowledge-pipeline.md)
- [Glossary](architecture/glossary.md)
