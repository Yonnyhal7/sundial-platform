# Artifact Lifecycle

# Purpose

Define how source and derived files are registered, identified, retained, accessed, and removed.

---

# Responsibilities

Preserve immutability, checksums, metadata, tenant/session lineage, cleanup safety, and least-privilege access.

---

# Architecture

## Current Implementation

Source PDF, source metadata, rendered-page PNGs, and page metadata JSON are stored under session-scoped paths. Registration computes SHA-256; if database registration fails after storage write, cleanup is attempted. Session deletion cascades registry rows; complete storage-retention behavior requires verification.

## Future Vision

Lifecycle policy distinguishes source evidence, reproducibility-critical derivatives, ephemeral intermediates, and published knowledge references.

---

# Data Model

Current artifact fields include session, type, path, page, content type, size, SHA-256, metadata, and creation time.

---

# Processing Pipeline

Receive/derive → fingerprint → write storage → register metadata → consume by reference → retain/archive/delete by policy.

---

# Public Interfaces

Current storage is accessed through `ImportArtifactStorage`; future signed/read interfaces and retention commands are TODO.

---

# Internal Components

Artifact registry, Supabase storage adapter, workspace path helpers, metadata tables, cleanup jobs (TODO).

---

# Future Enhancements

Deduplication, malware/content scanning, lifecycle tiers, legal holds, secure export.

---

# Open Questions

- What retention applies after completion/failure?
- Must approved knowledge remain reproducible after source deletion?

---

# Testing Strategy

Checksum, immutability, partial-write cleanup, path isolation, cascade behavior, missing blob, retention, and authorization tests.

---

# Notes

Database cascade alone must not be assumed to delete storage objects.

## Related documents

- [School Knowledge Session](../03-school-knowledge-session.md)
- [Rendering Pipeline](rendering-pipeline.md)
- [Data Flow](data-flow.md)
