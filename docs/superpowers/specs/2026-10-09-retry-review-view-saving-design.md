# Retry review view saving

Show “Retry saving review views” when saving is enabled but the latest write failed. Retry the current visible selection and all current navigation preferences without changing the view or review progress. Successful writes restore remembered status and remove the retry button; repeated failures keep the warning and retry available. Paused saving continues to offer only the existing resume action.

Reuse the existing explicit-save handler with distinct retry/resume result handling. Verify retry visibility, repeated denial, recovery, persisted current view, notes, acknowledgments and checkpoint; mutation-test result and visibility guards.
