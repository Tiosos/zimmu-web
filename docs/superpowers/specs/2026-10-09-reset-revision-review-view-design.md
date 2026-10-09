# Reset revision review view

Provide one “Reset review view” button near the local review heading to restore all change, part-summary and checklist view preferences to their defaults. Clear change search, classification and part filter, summary search and pending-first ordering, coverage searches/orderings and pending-only. Keep the currently visible finding selected when possible; if filters hide every finding, retain the prior selection for the restored view.

Reset changes only view state: preserve acknowledgments, notes, reviewer, checkpoint status, disclosure state and in-flight resume handling. Keep existing scoped clear controls. No review schema or saved-report changes. The reset action is available even in a default or empty view.

Verify all controls reset together, selection/notes/acknowledgments/checkpoint remain intact, full downloads and slow resumes survive, and empty reports work. Exercise resetting multiple checklist preferences in Chromium. Deliberately omit resets and change selection/checkpoint behavior to prove assertions detect regressions.
