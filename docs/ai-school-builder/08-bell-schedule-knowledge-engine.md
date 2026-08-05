# Bell Schedule Knowledge Engine

# Purpose

Define a future engine for bell schedules and their effective-date rules.

---

# Responsibilities

Propose named schedules, periods, times, applicability, exceptions, provenance, and review issues.

---

# Architecture

## Current Implementation

Sundial has schedule/calendar domain behavior, but no shared Bell Schedule Knowledge Engine exists.

## Future Vision

Consume normalized artifacts from any compatible connector and emit domain-specific proposed objects.

---

# Data Model

TODO: schedule identity, period/order, local wall-clock times, timezone context, effective range, recurrence/applicability, exceptions, provenance.

---

# Processing Pipeline

TODO: classify → extract → normalize times → resolve schedule identity → validate → review.

---

# Public Interfaces

TODO: supported artifact capabilities and Knowledge Object schema.

---

# Internal Components

TODO: time parser, period normalizer, schedule matcher, validators.

---

# Future Enhancements

Rotations, minimum days, exam schedules, campus variants, and source refresh.

---

# Open Questions

- How should overlapping effective schedules be resolved?
- Which timezone/DST rules belong in the object versus school configuration?

---

# Testing Strategy

Fixtures for 12/24-hour time, DST boundaries, rotations, missing periods, conflicts, and tenant-safe publication.

---

# Notes

Do not infer a single bell schedule when evidence indicates variants.

## Related documents

- [Knowledge Engine API](06-knowledge-engine-api.md)
- [Academic Calendar Engine](07-academic-calendar-knowledge-engine.md)
- [Source Conflict Resolution](16-source-priority-conflict-resolution.md)
