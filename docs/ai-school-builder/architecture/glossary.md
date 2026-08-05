# Canonical Glossary

# Purpose

Define the official vocabulary for AI School Builder.

---

# Responsibilities

Prevent one term from representing multiple lifecycle or trust concepts.

---

# Architecture

| Term | Canonical definition |
| --- | --- |
| AI School Builder | Sundial's guided system for acquiring, interpreting, verifying, reviewing, and publishing reusable school knowledge. |
| Teach Sundial About Your School | Product promise describing the outcome, not a component. |
| School Knowledge Session | Tenant-scoped, versioned, auditable unit of ingestion and review work. |
| School Knowledge Base | Versioned store/read model of approved reusable school knowledge. Future; not raw artifact storage. |
| Knowledge Workspace | Session-scoped collection of registered source and derived artifacts plus diagnostics. |
| Knowledge Artifact | Immutable or content-addressed source/derived evidence registered to a session. Preferred full term. |
| Artifact | Short form for Knowledge Artifact when context is unambiguous. |
| Knowledge Engine | Versioned domain component that proposes Knowledge Objects from normalized artifacts. |
| Knowledge Object | Typed domain proposal or approved record with lifecycle state and provenance; proposal is not automatically truth. |
| Source Connector | Implementation of the connector contract for one source class/provider. |
| Connector | Short form for Source Connector; never a Knowledge Engine. |
| Render Worker | Architectural role that converts documents to analysis-ready artifacts; currently request-side code, not a deployed worker service. |
| Verification Engine | Rule/policy layer producing reproducible checks and conflicts for proposed objects. |
| Knowledge Review Center | Shared human-governance experience for proposals, evidence, issues, and decisions. |
| Review Center | Approved short form for Knowledge Review Center. |
| Confidence Score | A bounded signal about a proposal or dimension; not proof, source authority, or publication permission. Exact model is TODO. |
| Pipeline Stage | Named lifecycle step with explicit input/output and transition semantics. |
| Provenance | Trace from a claim/object to source artifact/location, transformation, and relevant versions. |
| Approved Knowledge | Knowledge Object version accepted under authorization and publication policy. |
| AI School Assistant | Future authorized consumer of approved School Knowledge that answers with evidence and uncertainty. |

## Current Implementation

`ImportSession` and `ImportArtifact` exist in the advanced importer. Most broader terms define future architecture.

## Future Vision

New terms must be added here before becoming public architectural vocabulary.

---

# Data Model

Definitions describe concepts, not finalized table names.

---

# Processing Pipeline

Use lifecycle qualifiers such as “proposed,” “verified,” “reviewed,” and “approved”; do not call all outputs “knowledge” without state.

---

# Public Interfaces

User-facing copy may be simpler but must not contradict these meanings.

---

# Internal Components

Code types should converge on these terms as phases are implemented, subject to compatibility.

---

# Future Enhancements

TODO: add terms for publication, supersession, freshness, authority policy, and engine run when designed.

---

# Open Questions

- Should “Knowledge Workspace” become a persisted first-class entity or remain the artifact view of a session?

---

# Testing Strategy

Architecture reviews and API/schema naming checks should reject ambiguous lifecycle terminology.

---

# Notes

Avoid using “AI” as a synonym for the entire pipeline; much verification and governance should be deterministic.

## Related documents

- [Vision](../00-vision.md)
- [System Overview](system-overview.md)
- [Product Philosophy](../01-product-philosophy.md)
