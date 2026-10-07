# Protect edited revision reviews from discard

Warn before an edited local revision review is discarded by Close, Escape, selecting a replacement packet, comparing again or resuming another review record. Cancel retains the current review, packet selections and comparison. Confirm permits the requested action. The warning directs users to download revision review JSON first.

Track edits since the last JSON download or successful resume. Reviewer, overall notes and all three acknowledgment/note groups count as edits; search, selection and pending filters do not. Downloading printable HTML does not reset this flag because HTML cannot resume progress. A successful JSON download initiation resets it without claiming the file reached disk; failed downloads keep it. Successful resume resets it, rejected or canceled imports do not. Existing import-generation protections remain intact.

Use the browser's native confirmation for these deliberate local actions. This feature does not promise recovery after reload or browser termination. Keep the dialog open when Escape is canceled. Clear a rejected file input and show the retained packet name so the active selection is explicit.

Test all discard routes and both answers, clean/view-only behavior, JSON versus HTML download behavior, canceled/invalid resume and generation races. Exercise canceled Close and Escape in the actual packet browser workflow, mutation-test the guards, and run repository checks.
