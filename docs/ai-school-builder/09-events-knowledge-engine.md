# Events Knowledge Engine

# Purpose

Define a future engine for school events.

---

# Responsibilities

Propose event identity, title, timing, location, audience, description, recurrence, status, provenance, and review issues.

---

# Architecture

## Current Implementation

Sundial has events product functionality; no Events Knowledge Engine exists.

## Future Vision

Reconcile event facts across approved sources without creating silent duplicates.

---

# Data Model

TODO: event object, external/source identity, local timezone semantics, recurrence, audience, lifecycle status, provenance, duplicate group.

---

# Processing Pipeline

TODO: extract → normalize → identify/deduplicate → verify timing/location → review → publish.

---

# Public Interfaces

TODO: event proposal schema and publication adapter.

---

# Internal Components

TODO: identity matcher, recurrence parser, time/location validator, duplicate detector.

---

# Future Enhancements

Change/cancellation detection and continuous calendar/feed connectors.

---

# Open Questions

- What constitutes the same event across sources?
- Which changes require re-review after publication?

---

# Testing Strategy

Duplicate, recurrence, cancellation, timezone/DST, ambiguous-date, and conflicting-location fixtures.

---

# Notes

Prefer an explicit conflict over merging two possibly distinct events.

## Related documents

- [Knowledge Engine API](06-knowledge-engine-api.md)
- [Source Conflict Resolution](16-source-priority-conflict-resolution.md)
- [Review Center](14-knowledge-review-center.md)
