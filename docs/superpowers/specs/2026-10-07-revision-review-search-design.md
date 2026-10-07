# Searchable revision review navigation

Add a **Find a change** search field to local revision review. Match literal substrings within the label, part ID, operation ID or stable change reference, ignoring case and surrounding whitespace and normalizing Unicode to NFC. Search applies only to detected changes and composes with the pending-only filter.

Keep selection on its current change when it matches; otherwise select the first visible change. Show match counts and explicit no-match feedback. Clearing search restores all eligible changes and their existing progress. Give the change selector a stable accessible name independent of option text.

Search is a view preference: it does not change record schemas, count totals, output/limitation lists, notes or either export. It does not invalidate pending imports. Validate field matching, literal punctuation, Unicode, pending-filter composition, empty states, restored notes and complete JSON/HTML exports. Exercise the workflow in the actual packet browser test; mutation-test the search predicate. Run project checks before publishing the change.
