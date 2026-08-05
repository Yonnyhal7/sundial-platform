# Announcements Knowledge Engine

# Purpose

Define a future engine for audience-targeted school announcements.

---

# Responsibilities

Propose announcement content, audience, timing, source authority, expiration, provenance, and safety/review issues.

---

# Architecture

## Current Implementation

Sundial has announcements/notifications capabilities; no Announcements Knowledge Engine exists.

## Future Vision

Create drafts or knowledge objects without automatically sending communications.

---

# Data Model

TODO: announcement identity, content, audience, publish/expire window, urgency, source authority, provenance, delivery intent.

---

# Processing Pipeline

TODO: extract → normalize → classify audience/urgency → verify → review → publish knowledge; delivery remains a separate authorized workflow.

---

# Public Interfaces

TODO: proposal schema and explicit boundary with notification campaigns.

---

# Internal Components

TODO: audience classifier, time-window parser, content validator, duplicate matcher.

---

# Future Enhancements

Multilingual variants, expiry refresh, channel-specific drafts.

---

# Open Questions

- Which source roles may assert urgency?
- How should corrected announcements supersede prior versions?

---

# Testing Strategy

Audience leakage, expiry, duplicate, correction, unsafe-send boundary, authorization, and provenance tests.

---

# Notes

Knowledge ingestion must never implicitly send or retry a production notification.

## Related documents

- [Knowledge Engine API](06-knowledge-engine-api.md)
- [Review Center](14-knowledge-review-center.md)
- [Source Conflict Resolution](16-source-priority-conflict-resolution.md)
