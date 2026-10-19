# Forget source-review view preferences

- Added deletion of only the dedicated source-view localStorage key. No review-draft IndexedDB, project data or unrelated setting is touched. The current view and navigation cursor remain live.
- Successful clearing pauses preference writes for the open review, including later filter changes. Reopening starts at defaults and resumes saving. Clear failures leave saving active and expose an error; they do not claim data was removed.
- Resuming first saves the current view successfully; a failed save keeps the pause in place. Action errors and normal preference write errors remain separate from review-draft autosave failures.
- Validation: 165 focused/integration tests across nine files passed; Chromium's real-project workflow exercised forget, pause, resume and reopening while retaining draft notes/check-offs and full exports. Lint and production build/typecheck passed (existing bundle-size warnings). Mutations bypassing the pause, successful-save requirement, scoped deletion and failed-clear guard all produced assertion failures; both sources were restored and all 18 preference/autosave integration tests passed again.
