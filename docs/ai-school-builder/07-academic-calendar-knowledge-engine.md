# Academic Calendar Knowledge Engine

# Purpose

Produce proposed academic calendar knowledge from school sources.

---

# Responsibilities

Interpret dated assignments and schedules, validate school-year coverage, expose ambiguity, and preserve evidence.

---

# Architecture

## Current Implementation

AI Calendar Import accepts PDFs, uses extracted-text and layout-aware paths, normalizes assignments, matches schedules, presents review issues, persists drafts/progress, and creates a calendar through a tenant-authorized atomic RPC with durable review audit. This is not yet implemented behind the shared Knowledge Engine API.

## Future Vision

Adapt proven calendar behavior to shared artifacts, provenance, verification, and publication without a compatibility regression.

---

# Data Model

Current domain concepts include dated schedule assignments, schedule resolution, issues, instructional-day review, assignment digests, drafts, and creation audit. Canonical Calendar Knowledge Object schema is TODO.

---

# Processing Pipeline

PDF text/layout analysis → normalization → schedule matching → validation/review → authorized calendar creation.

---

# Public Interfaces

Current calendar import routes/actions remain authoritative until an approved migration plan proves parity.

---

# Internal Components

PDF extraction, OpenAI analyzer, deterministic extraction, assignment merge/normalization, review presentation, draft persistence, creation RPC.

---

# Future Enhancements

Additional connectors, explicit provenance spans, cross-source reconciliation, incremental year updates.

---

# Open Questions

- TODO: define Calendar Knowledge Object and publication adapter.
- TODO: define parity and rollback gates for shared-pipeline migration.

---

# Testing Strategy

Retain real/golden PDF fixtures, contamination isolation, schedule matching, date coverage, review severity, digest, RPC, tenant, and authenticated creation tests.

---

# Notes

Never replace the current workflow merely to satisfy a new abstraction; migrate behind evidence.

## Related documents

- [Knowledge Engine API](06-knowledge-engine-api.md)
- [Verification Engine](13-verification-engine.md)
- [Existing deployment notes](../ai-calendar-import.md)
