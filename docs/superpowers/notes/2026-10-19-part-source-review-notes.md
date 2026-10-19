# Part-focused source reviews: six-task sequence

1. Part summary: derive stable groups from item findings, deduplicating linked references and retaining removed part IDs/labels. Shared hardware counts appear under each linked part; unlinked hardware remains globally reviewable.
2. Part filtering: narrow item rows only. Source sections and limitations remain visible and full comparison counts/exports are retained. Global group shortcuts clear the part filter.
3. Pending-part navigation: cycle matching parts with unfinished findings, clear finding search, enable pending-only and focus the first relevant item after the view commits. Repeated navigation wraps; empty/complete candidates disable the action.
4. Pending-first summary ordering: stable partition, independent of finding ordering and pending-only.
5. Summary search: NFC-normalized case-insensitive literal match over part labels, IDs and linked finding notes, with matched/total counts and a scoped clear action. This does not hide main findings by itself.
6. Remember part preferences: extend optional fields in the existing v1 view record. Missing fields restore safe defaults; reset, forget and pause/resume include the new state. Unknown saved part IDs are ignored and clearable.

Validation: 179 focused/integration tests across ten files passed. Chromium's real-project workflow exercised summary filtering, pending-part focus, remembered part settings and reset alongside draft restoration and complete JSON/HTML exports. Lint, typecheck and production build passed (existing bundle-size warnings). Deliberately breaking removed-part grouping, part filtering, completed-part skipping, summary ordering, note search and saved ordering caused assertion failures; original sources were restored and all 62 part/preferences/autosave component tests passed again. Additional cases cover shared-hardware counts, malformed preferences and unavailable saved part IDs.
