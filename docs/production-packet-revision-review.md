# Local production-packet revision review

After comparing two verified packets, use **Local revision review** to acknowledge individual detected changes and add notes. The change selector includes all changes, including those beyond the comparison preview's first 200. Selected changes retain earlier/later output locations and expandable definitions and provenance.

**Download revision review** saves `production-packet-revision-review.json`. Save drafts at any point. The schema-version-2 record contains a save timestamp, optional self-reported reviewer name, overall notes, separate change/output/limitation stable references, acknowledgments and notes, and the full comparison with both archive SHA-256 hashes and its scope limitations.

To resume, compare the same two ZIP archives in the same order and choose the saved JSON under **Resume revision review**. Import checks schema, both hashes, the complete comparison and the exact sets of unique change, output and limitation references. Mismatches or invalid records leave the current review untouched. Replacing a packet or comparing again starts fresh; closing the dialog discards unsaved changes. Nothing is uploaded or written into the project or packet archives.

Expand **Other changed outputs** to record review of each changed PDF, readiness document or stock list at its packet-relative path. Inspect the earlier/later archives yourself; a path can exist in only one revision. These outputs are identified by file hashes and have not been semantically compared.

Expand **Comparison limitations** to record that you read each limitation and add any follow-up note. Acknowledgment does not resolve a limitation or expand the comparison's coverage. The three progress counts remain separate and never imply production approval.

Version-1 drafts can still be resumed for the exact same comparison. Existing change acknowledgments and notes are retained; output and limitation items start unchecked. The next download saves version 2. Output references use `PO:` plus the JSON-encoded path; limitation references use `PL:` plus the JSON-encoded statement. Duplicate, missing or unknown references fail import.

Acknowledgment counts describe the items in each group. Partial comparisons remain partial even when every detected change is acknowledged. Other changed outputs are not semantically compared and still require review. Blocked comparisons cannot create review records. Zero detected changes does not establish production readiness.

This is a local, editable, unsigned record. Reviewer names are self-reported; neither identity nor acknowledgments are authenticated. It is not formal production approval. Archives that are repacked have different hashes and require a new review. Future comparison-rule changes may also prevent resuming an old comparison. Resume inputs are limited to 16 MiB.

**Download printable review** saves a standalone HTML snapshot with independent acknowledged/pending counts, pending items first, review notes, ordered packet hashes, all changes, provenance and earlier/later output locations. Open it in a browser and use Print to print or save a PDF. All items are included, even beyond the dialog preview. Partial coverage and other limitations remain explicit. HTML text is escaped and the report uses no scripts or external resources. Keep the JSON record to resume editing; the HTML snapshot is for reading and sharing.

When a review file is loading, a newer import or any edit to review progress cancels its pending result. Slow file reads and late errors cannot overwrite newer progress. Closing the dialog also invalidates pending reads.

Use **Show pending items only** to hide acknowledged changes, outputs and limitations. When a change is acknowledged, selection moves to another pending change. Clear the filter to see and edit earlier acknowledgments and notes. The filter affects only the dialog: counts, JSON records and printable summaries always retain every item.

**Find a change** searches detected changes by label, part ID, operation ID or stable reference. Matching ignores case and surrounding whitespace and treats punctuation literally. It works together with the pending-only filter and reports the number of visible matches. Clear or adjust search when no changes match. Search affects only change selection; acknowledgment counts, output/limitation checklists and both exports remain complete. Search is not stored in the JSON record.

Use **Previous change** and **Next change** to step through the current search and pending-filter matches in comparison order. The position indicator counts those matches. Controls stop at the first and last match and do not acknowledge changes; existing notes and complete exports are retained.
