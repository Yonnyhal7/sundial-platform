# Render Worker

# Purpose

Convert documents into stable, inspectable artifacts suitable for layout-aware analysis.

---

# Responsibilities

Render every supported page, record dimensions/timing/runtime diagnostics, register artifacts, and fail visibly when output is incomplete.

---

# Architecture

## Current Implementation

`DocumentRendererService` uses `pdf-parse` screenshots with `@napi-rs/canvas` at 300 DPI. It processes pages sequentially, emits step diagnostics, stores PNG and JSON metadata artifacts, and destroys the parser in cleanup.

## Future Vision

Execution may move to a dedicated worker boundary when workload evidence requires it. Queue, retry, resource limits, OCR, and alternate renderer decisions are TODO.

---

# Data Model

Current page metadata: page number, width, height, DPI, rotation, render time, and artifact link.

---

# Processing Pipeline

Load renderer → initialize document → inspect page count → render/register each page → record diagnostics → cleanup → mark render complete.

---

# Public Interfaces

Current internal interface accepts PDF bytes and returns PNG bytes plus page metadata; diagnostic observation is callback-based.

---

# Internal Components

Renderer, artifact registry, storage adapter, page-metadata persistence, diagnostics service.

---

# Future Enhancements

TODO: worker queue, bounded parallelism, OCR/text layers, renderer fallback, cancellation, and artifact retention.

---

# Open Questions

- What page/byte/runtime limits apply by environment?
- Which artifacts are required for reproducible reruns?

---

# Testing Strategy

Golden PDFs, corrupt/encrypted/rotated/large documents, missing-page detection, memory bounds, cleanup, and deployment-runtime smoke tests.

---

# Notes

“Render Worker” is the architectural role; current rendering still runs in the request-side server workflow.

## Related documents

- [Rendering Pipeline](architecture/rendering-pipeline.md)
- [Artifact Lifecycle](architecture/artifact-lifecycle.md)
- [Testing Strategy](17-testing-strategy.md)
