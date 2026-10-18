# Pending source-review group shortcuts

- Added group shortcuts for item changes, other source changes and limitations. Each finds the first pending entry in grouped display order independent of search, clears search and enables pending-only before focusing the checkbox after DOM commit.
- When the desired view is already active, focus moves immediately: setting identical React state would not trigger the layout effect. Repeated shortcut use must still focus correctly.
- Group availability uses full coverage rather than filtered visibility and is disabled while normal review controls are busy. A completed or absent group cannot affect another group's availability. Navigation remains across all pending findings after the jump.
- These are view actions only; no review edit, autosave, JSON schema or downloaded-checkpoint change is introduced.
- Validation: 151 focused/integration tests across eight files passed; Chromium's complete source-review workflow passed with all three group shortcuts, focus, search clearing, autosave restore and report exports. Lint and production build/typecheck passed (existing bundle-size warnings). Removing category selection caused three assertion failures; deferring focus without a state change on a repeated jump caused the expected focus assertion failure. Both mutations were restored before the final passing regression run.
