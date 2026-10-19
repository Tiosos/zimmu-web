# Local production-packet revision review

After comparing two verified packets, use **Local revision review** to acknowledge individual detected changes and add notes. The change selector includes all changes, including those beyond the comparison preview's first 200. Selected changes retain earlier/later output locations and expandable definitions and provenance.

**Download revision review** saves a JSON record named for the project and ordered packet pair. Save drafts at any point. The schema-version-2 record contains a save timestamp, optional self-reported reviewer name, overall notes, separate change/output/limitation stable references, acknowledgments and notes, and the full comparison with both archive SHA-256 hashes and its scope limitations.

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

The printable HTML includes a **Contents** navigation list and **Back to contents** links for long review groups. Links stay within the saved file and work offline. Navigation is hidden when printing or saving a PDF; all review content remains included.

After editing a review, Close, Escape, packet replacement, re-comparison and resuming another record ask before discarding edits. Cancel keeps the current review and packet selections. Download revision review JSON first to keep progress. A JSON download initiation or successful resume resets this warning; printable HTML and view filters do not. This tracks edits since that checkpoint, not whether a file was saved to disk. Reloading or terminating the browser can still discard local progress.

The selected change shows its identity and classification, plus a **Selected change fields** table with earlier and later values. Added or removed entities show both definitions and identify the absent revision. Recorded null, false and empty-string values are retained; missing values say Not recorded. Expand **Selected change details** to inspect the full record and provenance. Notes and acknowledgments stay with their stable references as you move between findings.

Review JSON and printable HTML downloads share a filename containing the later project name and the first 12 characters of the earlier and later archive hashes, in that order. Project names are normalized and shortened for filesystem-safe names. Hash prefixes help distinguish packet pairs; inspect full hashes inside the record when verifying identity. Repeated downloads for the same pair may receive a browser-added suffix.

Use **Change classification** to show all findings, manufacturing changes, or metadata changes. This filters whole findings by their recorded classification; all fields remain visible within each finding. Combine it with search and pending-only filtering. Match counts describe the filtered view, while acknowledgment totals and JSON/HTML downloads retain every item. Classification is a view preference and is not saved in the review record.

Use **Review pending manufacturing changes** or **Review pending metadata changes** below the progress summary to select that classification, enable pending-only and clear search together. Buttons are disabled when their classification has no pending findings. The current eligible finding remains selected; otherwise the first matching pending finding is shown. Notes, acknowledgments, global counts and downloads remain complete.

The live status says **Review edits awaiting a JSON checkpoint** after editing reviewer details, notes or acknowledgments. JSON download initiation or a validated resume returns it to **No new review edits**. Navigation and printable HTML preserve it. Keep the downloaded JSON file to resume editing; this indicator does not confirm the file was saved to disk.

**Detected change progress by part** groups every recorded part and operation finding by stable part ID in both the dialog and printable report. It shows part/operation finding counts and acknowledged, pending and total findings. Labels come from recorded part findings; operation-only groups show their part ID. Search, classification and pending filters do not shrink these totals. Parts with no detected findings are not listed, and finding counts do not count machining operations or establish production readiness.

Select a part in **Detected change progress by part** to review only findings with that exact stable part ID. This clears search, classification and pending-only filters and selects the first recorded finding for that part. **Show all parts** removes the part focus; **Clear navigation filters** resets every change-selection filter. Global pending-classification shortcuts also remove part focus. Empty results within a focused part describe that part's filters, rather than implying the whole review is complete. Navigation preserves notes, acknowledgments, checkpoint status and pending imports; downloads retain all findings.

In the printable HTML, each part summary links to its first recorded finding, even when acknowledged findings appear after pending ones. These links use fixed local anchors and work offline. They do not change the printed content or the saved JSON record.

Select a part's **Pending** count to review only that part's unfinished findings. This resets search and classification, enables pending-only, and starts at the first pending finding. The count is disabled when the part has no pending findings. Acknowledging a finding advances within the focused part; finishing that part leaves scoped feedback while other parts' pending work remains in the summary. **Show all parts** keeps pending-only active; **Clear navigation filters** also shows acknowledged findings. The printable summary retains its numeric counts and links to all findings.

Printable HTML also links each nonzero **Pending** count to that exact part's first unfinished finding in comparison order. A zero pending count stays plain text. Part-name links still reach the first recorded finding, including acknowledged findings. Both link types use fixed internal anchors and work offline; all findings remain included when printing.

Each finding in printable HTML includes **Back to part summary**, returning to that exact part's summary row. This also works for operation-only groups and acknowledged findings. Return links stay within the saved file and are hidden when printing; finding details remain included.

Enable **Show pending parts first** to put parts with unfinished findings ahead of fully acknowledged parts in the dialog summary. Comparison order is preserved within each group, and all parts and counts remain visible. The order updates as you acknowledge findings. This view preference does not change selected findings, filters, notes, checkpoint status, pending resumes or saved JSON. Printable reports always use pending-first part order, with their forward and return links retained.

**Find a part in summary** searches recorded part labels and stable part IDs with case-insensitive, Unicode-normalized literal matching. Operation-only groups can be found by their part ID. Search works with pending-first ordering and shows matched/total part counts. **Clear part search** restores the full summary. This search affects summary rows only; selected findings, change-navigation filters, notes, checkpoint status, pending resumes and complete JSON/HTML downloads remain intact. The query is not saved in the review record.

**Review pending changed outputs** enables pending-only, opens **Other changed outputs** and focuses its first unfinished acknowledgment checkbox. It is disabled when that group has no pending items. Existing change-navigation and summary settings, notes, checkpoint status and pending resumes remain intact. Reuse the shortcut to reach another unfinished output. Clear pending-only to edit acknowledged output notes. These files still require inspection in the archives; the shortcut does not semantically compare their contents or imply production approval.

**Review pending comparison limitations** opens the limitations checklist, enables pending-only and focuses its first unfinished acknowledgment checkbox. Its disabled state is independent of changed outputs. Reuse it to reach another unread limitation, or clear pending-only to edit acknowledged notes. This preserves other view settings, edits, checkpoints and pending resumes. Acknowledgment records that you read a limitation; it does not resolve it or expand comparison coverage.

In printable HTML, nonzero pending counts for **Other changed outputs** and **Comparison limitations** link to their first unfinished recorded item. Completed and empty counts stay plain text. These fixed internal links work offline and preserve separate group counts, complete sections and scope warnings. Changed outputs still require archive inspection; acknowledging limitations does not resolve them.

Each output and limitation finding in printable HTML includes **Back to review progress**, returning to its own group’s progress row. This includes acknowledged findings and works offline. Return links are hidden when printing; counts, notes and findings remain included.

The overall **Detected changes** pending count in printable HTML links to the first unfinished recorded change in comparison order. Completed and empty counts remain plain text. The finding retains its **Back to part summary** link, and all detected changes remain included.

**Find a changed output** and **Find a comparison limitation** search each checklist independently by recorded label or stable reference. Matching is literal, case-insensitive and Unicode-normalized, and combines with pending-only filtering. Visible-item counts describe the view; acknowledgment counts and JSON/HTML downloads still include every item. Clear either search independently. Pending group shortcuts clear that group’s search before focusing its first unfinished item, preserving the other query and review edits. Search is not saved in the review record.

Output and limitation checklist headings show explicit **pending** totals alongside acknowledged/total counts. These cover the complete group even when search or pending-only filtering hides items, and update as you acknowledge, unacknowledge or resume a review. Empty and completed groups show zero pending.

Enable **Show pending outputs first** or **Show pending limitations first** to move unfinished items ahead of acknowledged items in that checklist. Recorded order remains within each group and is restored when the toggle is off. Ordering updates as acknowledgment changes, works with search and pending-only filtering, and preserves notes and complete downloads. Each toggle is independent and is not saved in the review record.

**Reset review view** restores all review searches, filters and ordering preferences to their defaults together. It preserves the current finding where possible, notes, acknowledgments, reviewer, checkpoint status and pending resumes. Existing scoped clear controls still affect only their own view. Resetting the view does not modify saved review content or comparison coverage.

Checklist searches also match each item’s **review note**, using the same literal, case-insensitive Unicode-normalized matching. Results update when notes are edited or resumed; an item may disappear if its edited note no longer matches. Clear that checklist’s search to continue editing. Other groups’ notes and overall review notes are not searched, and downloads still include every item.

This browser remembers view preferences for the ten most recently used **earlier/later packet hash pairs**, including searches, filters, ordering and selected findings. Reversed or different pairs have separate preferences. **Reset review view** saves the restored defaults while retaining the current finding. Preferences may be lost if browser storage is cleared or unavailable. Failed automatic writes show an inline storage warning; **Retry saving review views** retries the current view without changing navigation or progress; the next view change also retries saving and a successful write restores the remembered status. This does not save review notes, acknowledgments, reviewer or checkpoint progress: use the review JSON to resume those.

**Forget remembered review views** clears saved view preferences for all retained packet pairs, leaving the current review and other browser data intact. Preference saving pauses for that open review until it is reopened, so the cleared data is not immediately recreated. **Resume saving review views** saves the current view and resumes future preference writes without changing review progress. If storage rejects that save, saving stays paused and you can retry. Reopening starts with defaults and resumes saving view preferences. If browser storage cannot be cleared, the action reports failure; review editing and exports remain available.

Part-summary search also matches notes on detected part and operation changes. It reads current or resumed review notes, using the same literal normalized search as IDs and labels. Global, output and limitation notes do not match a part.

Matching-note excerpts in part-summary results show the finding reference and context around the search text. They appear only for matching notes and do not shorten the notes saved in review downloads.

Select a matching-note finding reference to open that exact finding. This clears finding filters while retaining the summary query and review progress.

Matching-note jumps scroll to and focus the selected note field, including when activated with the keyboard.

After a matching-note jump, **Return to matching search** focuses the originating result. If edits remove that match, it focuses the summary search field instead. Review edits remain intact.

Previous/Next matching-note controls follow the part-summary search results without wrapping. They keep the query, focus each destination note, and leave progress unchanged.

Part-summary searches show total and per-part matching-note counts. Rows matching only a label or ID show zero matching notes; identical note text on different findings counts separately.

## Production release gate

In **Verify production packet**, use **Assess production release** to combine the exact ZIP's integrity, manufacturing readiness, drawing/machining reconciliation and revision-review evidence. Correction findings block technical release; advisory, skipped and unassessed checks remain review requirements. Acknowledging a revision never corrects a manufacturing blocker.

Revision mode requires the earlier ZIP and saved review JSON. The app recomputes the comparison and rejects stale reviews; changes, other outputs and comparison limitations must all be acknowledged. Choose **Initial release — no predecessor** only when there is no earlier packet.

Download the release record beside the ZIP. It contains the final packet SHA-256, evidence hashes, traceable findings and independent formal-approval status. Changing a packet requires a fresh assessment. The packet manifest includes the shared gate policy; the final-hash assessment remains separate to avoid circular hashing. Technical readiness and locally saved evidence do not grant formal production approval. Packet exports remain available for fixing blockers.

## Working design release status

The status below the main toolbar compares the current production source with the highest recorded revision. It shows **No recorded release**, **Matches revision N**, or **Unreleased changes since revision N**. Editing a dimension changes the status; undoing it restores a match when all captured inputs match again.

This is an exact source-hash comparison using the same capture as the packet exporter: scene, project name, material library and hardware library. Labels, visibility and library pricing can therefore trigger unreleased changes too. Camera position and the recorded release list are outside this comparison. Saving the working file does not record a new release.

The latest release must pass its stored snapshot integrity check. A failed latest check or any unreadable release entry makes comparison unavailable rather than silently using an older baseline. Pending checks and source-check failures are shown explicitly. This status does not indicate production approval.

### Compare the working design with a release

Choose **Review releases** beside the toolbar status, then **Compare with this release** on any release whose snapshot integrity check has passed. The comparison shows added, removed and modified parts and hardware, grouped as manufacturing or metadata changes. Expand an item to inspect each changed field's before/after values. **Show [part]** selects a current part and opens the model's 3D view; removed parts have no selection target. Hidden parts are identified and keep their visibility.

Part comparison uses the shared manufacturing inventory for dimensions, materials, stock, grain and edge treatment, plus captured cuts, manual instructions and resolved world placement. Hardware includes manual entries and the generated cabinet requirements, with current source-specific library purchasing details. Labels, presentation, provenance and prices count as metadata; additions, removals and any physical/purchasing change count as manufacturing changes. A mixed item appears in manufacturing, with individual field classifications retained. Labels nested within machining definitions are conservatively treated as manufacturing changes.

Other changed source sections are listed as well, including raw part/hardware records and library, material, component and joint data. These may overlap the detailed item changes; they also expose changes outside the compared projections. Source record ordering can trigger the exact toolbar hash status even when individual item projections match.

The comparison reads frozen source using the current application's manufacturing rules; it does not recreate or verify the original exported drawings or packet, grant approval, or assess machine compatibility or hardware suitability. Unusable snapshots show an error instead of an empty result. Use production packet comparison for actual exported output revisions. Comparison does not change the design, saved release or file format.

### Download a change report

In **Changes since revision N**, choose **Download printable change report** or **Download change report JSON**. Downloads capture the displayed comparison when requested. The standalone HTML can be opened locally and printed or saved as PDF through the browser's Print command; it includes every field without requiring expanded on-screen details. New JSON downloads use schema version 2 and kind `release-source-change-report`; version 2 includes the local review record. Previously downloaded version-1 reports remain unchanged.

Both formats include the capture timestamp (UTC), application version, baseline revision/release ID, baseline and current project names, both complete source SHA-256 hashes, and the recorded packet hash as a reference. They retain added/removed/modified parts and hardware, before/after field values, per-item and per-field classifications, current part references, other changed source section names and comparison limitations. Counts refer to changed items, not fields. An unchanged comparison remains exportable with zero counts.

The baseline source hash is checked again before download. Failed hashing or a mismatched baseline produces an error and no download; retry is available. While preparing one format, both download buttons are disabled. Closing the comparison cancels delivery. Later edits cannot change a downloaded report; download again for a new snapshot. These reports compare captured sources using current application rules, and neither verify the original production ZIP nor record approval. Other changed source sections are identified by name; their complete definitions are not reproduced in the report.

### Review the change report

Use **Reviewer name** and **Overall review notes**, then check **Reviewed** and add a **Review note** for each changed item, other changed source section and comparison limitation. Progress counts all of these findings; checking an item does not automatically check its source sections or limitations. Fields and exports allow partial reviews and an optional reviewer name. Names are self-declared and unverified, and even a fully checked review does not record formal production approval.

Printable HTML and JSON include the reviewer, overall and per-finding notes, reviewed/pending states and progress. The review belongs to the exact baseline release ID/revision, packet reference and both captured source strings, whose hashes are included in the report. The exporter checks that context again before saving. Source changes get an unchecked review; marks from a different source pair are not applied. An identical source pair keeps its current draft across rerenders.

Review drafts autosave in this browser using IndexedDB, retaining up to ten recent source comparisons. Matching drafts restore automatically when reopened, including after a browser restart once the same project and design are loaded. Drafts are tied to the release, both source hashes and the current comparison results; mismatched drafts are never applied. Closing, Escape or jumping to a part waits for the latest save. Storage failures show a warning and retry action; unsaved edits still require confirmation before leaving. Browser data clearing, private browsing and eviction can remove drafts, so download JSON for a portable backup. Drafts store review text and check-offs, not project geometry, and do not modify project files. Use the JSON resume action below to restore a saved checkpoint. Reviewer names are limited to 100 characters; overall and individual notes to 5,000 characters. Review controls are disabled while a report is being prepared.

### Resume a change review from JSON

Open the same recorded-release comparison, then choose your downloaded file using **Resume change review JSON**. This accepts version-2 `release-source-change-report` JSON up to 64 MiB. Version-1 exports have no review record and cannot be resumed; HTML is a printable copy, not a resume file.

The app recomputes the current comparison and both source hashes, verifies the baseline source against its stored digest, and requires the same release ID/revision and packet reference. It checks the complete comparison, counts, other source sections and limitations, plus every review reference, label, category, note, identity, approval field and progress total. Reordered JSON object keys and review entries are accepted; missing, duplicate, unknown or altered findings are rejected. A different application version is acceptable only when the recomputed comparison and review coverage still match.

A successful resume restores reviewer name, overall/per-finding notes, check-offs and progress, and counts as an existing saved checkpoint. Further edits require a new download. If current review edits have not been downloaded, confirmation is requested only after the incoming file passes validation. Cancelling keeps the current draft. Invalid files, read errors or a comparison/review changing during loading also leave the draft intact; choose the JSON again to retry. Closing the dialog cancels pending delivery.

Review controls, downloads and the file chooser are disabled during loading. Validation confirms compatibility with the current comparison; it does not authenticate the file's author or verify that review work was actually performed. All review identities remain self-declared and formal production approval stays unrecorded.

Incoming JSON numbers must be finite; overflowing numeric tokens are rejected as invalid report data.

### Pending findings in source change reviews

In **Changes since revision**, enable **Show pending only** to hide reviewed item changes, other source changes and limitations. Counts always describe the full comparison. **Next pending finding** focuses and scrolls to the next unchecked finding in display order: manufacturing, metadata, other source changes, then limitations; it wraps at the end and is disabled when none remain. Focusing a finding or its note establishes where navigation continues. Checking a finding in pending-only view moves focus to the next pending checkbox; completing the final finding returns focus to the filter control. Clear the filter to edit completed findings.

Filtering and navigation do not change review content, download checkpoints or autosave records. JSON and printable HTML always include every finding and note. Resumed JSON and locally restored drafts update counts and visibility from their check-offs. The view restores this comparison’s saved search, pending-only and ordering settings when reopened.

**Search review findings** filters source-review findings by labels, stable IDs, changed fields and before/after values, linked current part labels, source-section/limitation text, and individual finding notes. Matching is literal, case-insensitive and Unicode-normalized; surrounding whitespace is ignored. Reviewer names and overall notes do not match individual findings. Search combines with pending-only filtering, with a visible/total count and explicit empty state. **Next pending finding** skips nonmatching findings and wraps within matching unfinished findings. **Clear finding search** preserves pending-only and review progress. Editing a matching note can remove its finding from the results; focus then returns to search. The query is remembered locally for this exact comparison; exports and autosave retain all findings regardless of search.

Use **Review pending changes**, **Review pending source changes**, or **Review pending limitations** to jump directly to unfinished work in that group. Each shortcut clears finding search, enables pending-only and focuses the first unchecked finding in display order. The shortcuts use complete group coverage, so a search hiding the group does not disable them. Empty or fully reviewed groups are disabled independently. Reusing a shortcut returns to its first remaining finding. These actions preserve notes, check-offs, autosave and download checkpoint state; they do not limit subsequent next-finding navigation to that group.

**Reset review view** clears finding search and turns off pending-only and pending-first together, showing every finding again. It preserves the navigation cursor, reviewer, notes, check-offs, autosave and download checkpoint. Focus returns to search. The button is disabled when the view is already at defaults or review controls are busy; **Clear finding search** remains available when you want to keep pending-only enabled.

Source-review search, pending-only and pending-first preferences are remembered for ten recent exact comparisons, identified by release ID/revision, packet reference and both source hashes. Reopening touches the comparison’s recency; older preferences are evicted independently of review drafts. **Reset review view** saves default preferences. Preference failures show a separate warning with **Retry saving source review view**; editing, draft autosave and report downloads remain usable. Browser storage clearing can remove remembered views. These records contain only the query and filter/ordering settings, not project geometry or review notes.

**Forget remembered source review views** removes view preferences for all retained source comparisons, preserving the current filters, review notes, check-offs, project data and unrelated settings. Preference saving pauses for that open review so later filter changes cannot recreate the cleared records. **Resume saving source review views** saves the current view and resumes automatic writes; if that save fails, saving stays paused and the button can be retried. Reopening the review starts from default filters and resumes preference saving. A clear failure reports an error and leaves saving in its previous state; retry the forget action when storage becomes available. These controls do not delete locally saved review drafts.

**Show pending findings first** places unchecked findings before reviewed findings within each manufacturing, metadata, source-section and limitation group. Original comparison order remains stable within each subset. Navigation follows displayed order; toggling ordering does not change findings, notes or report order. The preference is remembered per comparison, reset with the other view settings, and paused/forgotten with them. Older saved preferences default to the original ordering.

Each source-review group shows **pending**, **reviewed** and **total** counts for its complete coverage, independent of search, pending-only or ordering. Counts update after check-offs, JSON resume and local draft restoration; completed and empty groups show zero pending.

### Part-focused source reviews

**Part review summary** groups item findings by linked part, with pending/reviewed/total counts. Shared hardware appears in every linked part’s count, so part totals are not additive. Removed parts retain their recorded label and stable ID; unlinked hardware remains in the main findings rather than receiving an invented part link.

**Filter findings for …** narrows item rows to that part. Other source sections and limitations remain in scope; counts and exports still cover the full comparison. **Clear part filter** restores all item rows. **Next pending part** cycles through matching parts with unfinished findings, skipping complete parts, enabling pending-only, clearing finding search and focusing the part’s first pending finding. Group shortcuts clear part selection so their target cannot remain hidden.

**Show pending parts first** keeps incomplete parts ahead of completed parts while preserving comparison order within each group. **Find a part in review** searches labels, stable IDs and item-finding notes using literal, case-insensitive Unicode-normalized matching. Summary search does not change item filtering or review content. **Clear part search** preserves other settings.

Part selection, summary search and summary ordering are remembered with the existing exact-comparison preferences. Older records default to no selection/search and original ordering. Reset clears these settings too; forgetting and pausing view saving cover them without deleting review drafts. A saved selection that no longer identifies a summary part is ignored with a notice and can be cleared.
