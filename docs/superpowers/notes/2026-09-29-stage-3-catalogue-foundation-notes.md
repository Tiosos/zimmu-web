# Stage 3 catalogue foundation — implementation notes

**Plan:** `../plans/2026-09-29-design-to-manufacturing-architecture.md` (Stage 3)

- The three existing Base 600, Wall 600 and Tall 600 presets are seeded as `starter.*` catalogue definitions at version 1. Their dimensions, sections, materials and generated geometry do not change. They are examples pending company review, not approved company construction standards.
- New placements pin the definition ID and exact version. The saved `params` remain the working geometry source during this stage. The catalogue reference and sparse override map record provenance; a missing definition/version leaves saved geometry intact and is shown in the cabinet editor.
- Section IDs are instance identities, so override comparison ignores those IDs. An edited section or frame is one atomic override for now. The editor shows the provenance of each cabinet parameter. The catalogue does not yet expose publishing, rule administration, or an update-acceptance action.
- Existing v24 and older cabinets remain custom. Inferring a catalogue origin from a matching label or dimensions would assign provenance that the old file never recorded. The first save of an older file still uses a separate v25 copy.
- This PR introduces no automatic catalogue update. Future versions must retain old definitions or show the missing-version state and require an explicit preview and acceptance before changing a placed cabinet.
