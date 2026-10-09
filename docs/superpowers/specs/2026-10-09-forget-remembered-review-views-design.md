# Forget remembered review views

Provide “Forget remembered review views” to remove the dedicated local preference record for all retained packet pairs. Preserve current filters, selection, notes, acknowledgments and checkpoint status. Pause preference saving for the open review until it is reopened, so its old settings or later edits do not immediately recreate forgotten data. Reopened reviews start with defaults and remember subsequent view changes normally.

Clear only the review-view storage key; leave other browser data intact. Report success or unavailable-storage failure honestly with inline feedback, without interrupting review editing or exports. No confirmation required for this reversible view-only action. Never modify pending resume generations.

Test all-pair removal, unrelated storage preservation, unchanged current review and checkpoint, no immediate/later writes, default restoration on reopening, denied removal and slow resumes. Exercise the forget/pause/default-reopen flow in Chromium; deliberately break removal scope, save pausing and truthful feedback to confirm failures.
