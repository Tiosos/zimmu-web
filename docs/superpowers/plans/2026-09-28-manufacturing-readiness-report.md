# Manufacturing readiness - report-only shelf access

## Approved scope
Report-only: retain existing export availability. Show requested versus generated adjustable shelves, omitted shelves, unverified routes and angled insertion; link to existing previews and installation sheets.

## Data authority
- Requested quantities come from leaf-section specifications, including requests that cannot be seated on available pins.
- Generated quantities count actual cabinet-owned adjustable shelf boards in the scene, including hidden cabinets, scoped by cabinet plus role identity.
- Access status and preview data come from the existing generator/solver, with current material/part thickness overrides.
- Keep invalid/unassessed geometry, absent positions, missing boards with verified paths, and no verified route distinct. Flag duplicate/unexpected roles and stale generated boards with declined access.
- Report only; do not mutate scene, manufacturing output, undo history, persisted settings or export gates.

## UI
File menu opens a native modal with project totals and per-cabinet rows. Existing preview opens as a nested modal; Escape closes only the preview. Installation-sheet action closes the report and opens the existing viewer at the exact cabinet/shelf sheet. Requests without a pose cannot have fabricated previews or sheets. Recompute on scene changes; no solver work when report is closed.

## Verification
Model tests: straight/rotated/declined, missing pin positions, actual missing boards, hidden/multiple cabinets, invalid inputs, duplicates, thickness overrides and no mutation. UI tests: nested modal cancellation, exact sheet callbacks, refresh, empty state and keyboard isolation. Browser test: live preview/sheet navigation, removal through pin count, updated report and export controls remaining enabled. Typecheck, lint, full unit suite, build and E2E before ready for review.
