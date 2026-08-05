# Master Roadmap

# Purpose

Provide the phase-by-phase implementation sequence. Phase titles after Phase 1 are planning boundaries, not approved implementation designs.

---

# Responsibilities

For every phase, state objective, deliverables, constraints, and definition of done.

---

# Architecture

| Phase | Objective | Deliverables | Constraints | Definition of Done |
| --- | --- | --- | --- | --- |
| 1 — Workspace foundation | Create an auditable PDF import workspace without replacing production calendar import. | Sessions, artifacts, page rendering, diagnostics, ordered state, compatibility routes. | Preserve tenant authorization and current importer behavior. | Current foundation is code-complete only when migration/runtime validation and parity evidence are recorded. |
| 2 — Session hardening | Make sessions durable and operationally safe. | TODO: retry, retention, idempotency, cancellation, ownership specifications. | No cross-tenant access or orphaned artifacts. | TODO: approve contracts and failure matrix; pass integration tests. |
| 3 — Connector framework | Decouple acquisition from PDF upload. | Connector contract, normalized source envelope, first connector adapters. | No vendor details in engines. | Two connectors pass the same contract suite. |
| 4 — Knowledge Engine API | Establish shared engine inputs/outputs. | Versioned engine contract, provenance and issue formats, engine registry. | Domain payloads remain explicit and typed. | Calendar engine runs through the shared contract with parity evidence. |
| 5 — Calendar engine | Migrate calendar knowledge production onto the shared pipeline. | Calendar objects, validation, review adapter. | Preserve current creation/review behavior and audits. | Approved objects produce equivalent calendars in controlled fixtures. |
| 6 — Verification and conflict resolution | Make evidence and disagreements first-class. | Verification results, source priority rules, conflict review. | Confidence never silently overrides policy. | Deterministic fixtures cover agreement, conflict, and insufficient evidence. |
| 7 — Review Center | Provide cross-domain human governance. | Review queues, decisions, audit history, permissions. | Domain-specific context remains visible. | Authorized users can resolve and publish; failures remain retryable. |
| 8 — School Knowledge Base | Publish reusable approved knowledge. | TODO: storage schema, versioning, read interfaces, invalidation. | Tenant isolation and provenance are mandatory. | At least two consumers safely read versioned approved objects. |
| 9 — Additional engines | Add bell schedules, events, athletics, and announcements. | Domain objects, validators, review policies per engine. | Do not force domains into a lossy generic schema. | Each engine passes its own acceptance corpus and shared contracts. |
| 10 — AI School Assistant | Answer and act from governed school knowledge. | Retrieval policy, citations/provenance UX, authorization, safe tool boundaries. | No raw-source or unapproved-knowledge bypass. | Answers are tenant-safe, attributable, and uncertainty-aware. |
| 11 — Continuous knowledge operations | Keep knowledge current over time. | Refresh scheduling, change detection, expiration, operational dashboards. | No automatic destructive replacement of approved truth. | Controlled refresh detects change, requests review, and preserves history. |

## Current Implementation

Only the Phase 1 foundation has concrete repository implementation. Its production readiness is not asserted by this document.

## Future Vision

Phase gates should be updated by architecture decisions and measured adoption, not dates alone.

---

# Data Model

Each phase must add a schema appendix or link to its migration and compatibility plan.

---

# Processing Pipeline

Later phases may begin discovery early, but publication dependencies proceed in phase order.

---

# Public Interfaces

No proposed interface becomes stable until its phase definition of done is met.

---

# Internal Components

See the numbered component specifications.

---

# Future Enhancements

Reorder phases only with a recorded impact assessment.

---

# Open Questions

- TODO: assign owners, milestones, and release evidence to every phase.
- TODO: decide whether engine rollout within Phase 9 should use subphases.

---

# Testing Strategy

Every phase requires automated, migration/data, deployment, and authenticated runtime evidence as applicable.

---

# Notes

“Done” means operationally proven, not merely merged.

## Related documents

- [Testing Strategy](17-testing-strategy.md)
- [Future Roadmap](18-future-roadmap.md)
- [System Overview](architecture/system-overview.md)
