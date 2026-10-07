# Pending-only revision review view

Add a **Show pending items only** toggle to local revision review. It filters detected-change selection and the output/limitation checklists without changing recorded progress, global group counts or either download. No schema migration is required.

When an acknowledged change leaves the filtered list, show the next available pending change, using report order; if none remain, show an explicit empty state. Keep every acknowledgment and note so clearing the filter restores the complete review and permits edits. Empty output/limitation groups explain that no pending items remain. Filtering is a view preference and does not invalidate a pending import or enter saved records.

Verify a multi-change review can acknowledge all items, navigate automatically, clear the filter and recover notes. Verify complete JSON and printable HTML still include acknowledged and pending items. Exercise the view with actual archives in the existing comparison browser test. Mutation-test the filtered change selection, then run the project checks and monitor the updated PR.
