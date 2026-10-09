# Resume review view saving

Offer “Resume saving review views” only while saving is paused after forgetting. Save the current visible selection and navigation preferences before resuming automatic writes. Preserve progress, notes, acknowledgments, checkpoint and pending resumes. Report success only when storage accepts the write; leave saving paused on failure and allow retry. Do not restore forgotten preferences for other pairs.

Verify success, subsequent writes, failure/retry, unchanged progress and reopening preferences in unit and Chromium tests. Mutation-test successful-save and state-transition guards.
