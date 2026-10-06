# Production packet review summary

Readiness combines manufacturing record checks, production readiness, machining reconciliation and shelf access into one advisory review. Hidden items remain included. The dialog, readiness PDF, `readiness/review.json` and `manifest.reviewSummary` use the same model. The JSON file is hashed with the other packet outputs. Packet summaries use the locations from the actual exported machining/drawing reconciliation; standalone readiness identifies its checked drawing set.

Classification:

- **Needs correction:** invalid manufacturing definitions, missing generated parts/shelves, and missing, duplicated or mismatched machining output facts.
- **Advisory:** empty/duplicate part labels, joinery reminders and angled shelf insertion. IDs remain authoritative; recorded joints do not certify geometry.
- **Unassessed:** source assessment limits, skipped checks, incomplete joinery scans, unverified shelf installation and cabinet shelf assessment issues. No assessed machining operations remains unassessed, never a passed check.

`status` prioritizes `needs-correction`, then `review-required` when unassessed items remain, then `advisory-review`, otherwise `no-reported-findings`. None of these statuses approves fabrication or disables exports. The dialog groups findings by classification and shows at most 200 per category. PDF/JSON/manifest include every returned review item, but cannot recover checks skipped by source engines.

Each item retains its source, original source references, stable part/component and operation IDs, drilling component/joint provenance, and source/output locations. Review references depend on source, code, target identities, operation and message, not source order. Identical findings within one source merge into one item while retaining every source reference/location; related findings from different sources remain separate. Counts describe review items, not unique physical defects or completed assessment coverage. Inspection targets use existing parts/components; a missing requested shelf retains its cabinet ID and shelf role.

All outputs capture one scene revision before asynchronous export work. The summary does not change the design, regenerate missing parts, or replace detailed source reports.
