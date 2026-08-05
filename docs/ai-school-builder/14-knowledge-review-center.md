# Knowledge Review Center

# Purpose

Provide the human governance surface for proposed knowledge, evidence, conflicts, and publication decisions.

---

# Responsibilities

Prioritize review, show source context, support accept/edit/reject/defer, enforce permissions, and preserve an audit trail.

---

# Architecture

## Current Implementation

AI Calendar Import contains domain-specific review presentation and resolution. A shared Review Center does not exist.

## Future Vision

Cross-domain queues share governance mechanics while domain panels retain specialized context and validation.

---

# Data Model

TODO: review item, assignment, priority, decision, edited value, actor, timestamp, reason, related verification/conflict, publication state.

---

# Processing Pipeline

Queue → inspect proposal/evidence → decide/edit → revalidate → approve for publication → audit.

---

# Public Interfaces

TODO: queue filters, decision commands, bulk-action safety, optimistic concurrency, and publication handoff.

---

# Internal Components

Queue service, permission checks, evidence viewer, domain review panels, decision audit, revalidation.

---

# Future Enhancements

Assignments, collaboration, review SLAs, change-impact previews, and correction explanations.

---

# Open Questions

- Which decisions can be bulk-applied safely?
- How are simultaneous reviewers reconciled?

---

# Testing Strategy

Keyboard/accessibility, permissions, concurrency, stale decisions, edit/revalidation, failure retryability, and audit completeness.

---

# Notes

Removing a review item from view must follow successful authorized persistence, not optimistic assumption.

## Related documents

- [Verification Engine](13-verification-engine.md)
- [School Knowledge Builder](12-school-knowledge-builder.md)
- [Knowledge Pipeline](architecture/knowledge-pipeline.md)
