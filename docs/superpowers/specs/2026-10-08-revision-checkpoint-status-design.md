# Revision checkpoint status

Show a polite live status in the local revision review: No new review edits initially and after successful resume or JSON download initiation; Review edits awaiting a JSON checkpoint after changing any persisted review content. Keep the existing ref for immediate async/discard guards and mirror its value into React state through the existing markEdited function. Avoid adding a separate persistence or approval model.

Explain that the downloaded JSON file must be kept to resume editing and that printable HTML does not clear this indicator. Do not claim the browser saved the file to disk, formal review approval or production readiness. Search, classification, pending views, clear filters and rejected imports must preserve the indicator. Valid imports and new comparison instances reset it. JSON schema and filenames remain unchanged.

Verify edit groups, JSON versus HTML behavior, navigation, rejected and valid resumes, and real-browser status transitions. Mutate state propagation, JSON clearing, HTML preservation and resume clearing; predict assertion failures and restore backups. Run all required tests, typecheck, lint, builds and focused browser test before publishing. This branch starts on the integrated #98 while its authorized merges complete; retarget to main once that code lands.
