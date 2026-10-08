# Part-specific review navigation

Each per-part summary row offers Review part, using exact stable ID matching rather than substring search. Selecting a part resets classification, pending-only and search and shows that part's findings in comparison order. Show the active ID and a Show all parts action that removes only part focus and preserves the current eligible selection. Clear navigation filters resets all four controls. Global pending-classification shortcuts remove part focus. Empty feedback distinguishes a focused part from globally completed work.

Navigation never edits or saves the review, acknowledges findings, cancels in-flight resumes or truncates exports/global summaries. Null represents all parts, avoiding collisions with IDs such as all. No review schema change.

Printed per-part rows link to their first recorded finding, including operation-only parts. Fixed finding-N anchors come from comparison order rather than untrusted IDs; rendered pending-first order does not alter these targets. All links remain internal and all records remain printed. Existing contents/return navigation stays intact.

Verify exact IDs with overlapping strings, all/special IDs, filters, notes/checkpoint status, restored selection, async resume, complete exports, zero/partial scoped feedback, safe offline links and real Chromium behavior. Mutate each new navigation guard and reset, inspect predicted assertion failures, restore backups. Run the full required test/type/lint/build suite and focused browser export check before publishing. Monitor exact-head CI and post-merge main.
