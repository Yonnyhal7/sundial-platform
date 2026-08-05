# Verification Engine

# Purpose

Evaluate proposed knowledge against deterministic rules, source evidence, other proposals, and school policy before review/publication.

---

# Responsibilities

Produce reproducible verification results, explain failures/warnings, and identify insufficient or conflicting evidence.

---

# Architecture

## Current Implementation

Calendar-specific validation and review issue generation exist. No cross-domain Verification Engine exists.

## Future Vision

Verification is a policy/rule layer independent from probabilistic extraction. It may use multiple signals but must report how each result was reached.

---

# Data Model

TODO: rule identifier/version, subject object, severity, status, evidence references, explanation, deterministic inputs/output, resolution.

---

# Processing Pipeline

Schema checks → domain invariants → evidence checks → cross-source consistency → policy checks → review requirement.

---

# Public Interfaces

TODO: verification request/result contract, rule registry, severity taxonomy, blocking policy.

---

# Internal Components

Rule registry, domain validators, evidence resolver, conflict detector, policy evaluator.

---

# Future Enhancements

Historical comparison, freshness rules, correction feedback, and school-configurable policies within safe bounds.

---

# Open Questions

- Which rules block publication globally versus by domain?
- How are rule-version changes applied to already approved knowledge?

---

# Testing Strategy

Deterministic rule fixtures, versioning, severity policy, evidence loss, conflicting-source, false-confidence, and authorization tests.

---

# Notes

Verification informs governance; it does not conceal uncertainty behind a single score.

## Related documents

- [Review Center](14-knowledge-review-center.md)
- [Source Conflict Resolution](16-source-priority-conflict-resolution.md)
- [Testing Strategy](17-testing-strategy.md)
