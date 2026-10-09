# Revision checklist note search

Extend each checklist's existing search to match its own saved review notes as well as recorded labels and stable references. Preserve literal, trimmed, case-insensitive NFC matching, independent queries, pending-only and pending-first behavior, complete counts/downloads and reset/shortcut behavior. Results update when notes are edited or resumed; clearing search restores the full applicable checklist. No schema changes or coverage changes.

Validate note-only and normalized/literal matches, independence, acknowledgment filters, edits that stop matching, full JSON/HTML exports and resumed notes. Chromium should find an acknowledged output by its note without losing its saved content. Mutate note inclusion, group isolation and normalization to confirm failures.
