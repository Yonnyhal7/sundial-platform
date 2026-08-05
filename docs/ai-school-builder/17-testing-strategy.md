# Testing Strategy

# Purpose

Define evidence required to trust AI School Builder changes.

---

# Responsibilities

Cover correctness, reproducibility, provenance, failure behavior, compatibility, security, tenant isolation, usability, and operations.

---

# Architecture

| Layer | Required evidence |
| --- | --- |
| Unit/contract | Schemas, transitions, validators, connector/engine conformance. |
| Corpus/evaluation | Versioned representative and adversarial sources with expected objects/issues. |
| Integration | Database, storage, renderer, model/provider boundaries, retry/idempotency. |
| Migration/data | Ledger, RLS/grants, forward/rollback plan, read-only probes. |
| End-to-end | Upload/connect, review, publish, resume/failure, tenant permissions. |
| Deployment/runtime | Target runtime rendering, limits, observability, authenticated behavior. |

## Current Implementation

The repository contains focused advanced-import service/flag/diagnostic tests and extensive AI Calendar Import tests. This document does not claim current production runtime proof.

## Future Vision

Maintain domain evaluation corpora and trend quality by engine/pipeline version without using production school data unsafely.

---

# Data Model

Test fixtures must carry provenance and expected lifecycle state. Evaluation results record code/model/prompt/pipeline versions.

---

# Processing Pipeline

Test success, every stage failure, retry, cancellation, stale concurrency, partial output, and cleanup.

---

# Public Interfaces

Contract tests protect released routes and future connector/engine/read APIs.

---

# Internal Components

Golden artifacts, synthetic tenants, deterministic clocks, provider fakes, migration checks, authenticated browser suite.

---

# Future Enhancements

Shadow evaluations, drift alerts, red-team corpora, performance/cost budgets, accessibility automation.

---

# Open Questions

- TODO: approve quality metrics and thresholds per engine.
- TODO: define sanitized corpus governance and ownership.

---

# Testing Strategy

Release reports must separate automated, migration/data, deployment, and authenticated/live-runtime proof. Passing one category does not imply another.

---

# Notes

Never mutate real school data merely to prove a recovery path; begin with synthetic fixtures.

## Related documents

- [Master Roadmap](02-master-roadmap.md)
- [Verification Engine](13-verification-engine.md)
- [Rendering Pipeline](architecture/rendering-pipeline.md)
