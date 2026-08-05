# Product Philosophy

# Purpose

Record principles that should remain stable while implementations change.

---

# Responsibilities

Guide product, architecture, UX, and safety tradeoffs.

---

# Architecture

| Principle | Consequence |
| --- | --- |
| Schools already create the information | Consume existing sources before asking for duplicate entry. |
| Every AI decision is reviewable | Preserve source, provenance, confidence, validation, and human decisions. |
| Knowledge is reusable | Do not trap results inside a single importer or screen. |
| PDFs are one source, not the architecture | Keep source acquisition behind connector contracts. |
| Connectors are interchangeable | Engines consume normalized artifacts, not vendor-specific responses. |
| Humans own publication | Confidence may prioritize review; it must not silently redefine school truth. |
| Tenant boundaries are structural | Every session, artifact, object, query, and action is school-scoped. |
| Safe uncertainty beats confident invention | Missing or conflicting facts become review items. |

## Current Implementation

The calendar importer already exposes review issues and durable review audit data; the advanced importer stores source/render artifacts and diagnostics. Reusable cross-domain knowledge is future work.

## Future Vision

Corrections should improve future proposals without erasing historical provenance.

---

# Data Model

Models must support provenance and lifecycle state independently from domain payloads.

---

# Processing Pipeline

Each stage must be observable, retryable where safe, and prevented from publishing incomplete work.

---

# Public Interfaces

Interfaces should expose uncertainty plainly and avoid implementation-specific connector details.

---

# Internal Components

Component replacement must not break knowledge-object or audit contracts.

---

# Future Enhancements

TODO: define retention, correction-learning, accessibility, and multilingual principles in detail.

---

# Open Questions

- TODO: define acceptable automation levels by knowledge domain and risk.

---

# Testing Strategy

Encode these principles as contract, authorization, provenance, and review-flow tests.

---

# Notes

Accuracy is necessary but insufficient; a system that cannot explain a result is not trustworthy school infrastructure.

## Related documents

- [Vision](00-vision.md)
- [Verification Engine](13-verification-engine.md)
- [Source Conflict Resolution](16-source-priority-conflict-resolution.md)
