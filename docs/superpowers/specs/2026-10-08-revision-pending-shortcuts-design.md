# Pending classification shortcuts

Add two named buttons below the detected-change progress table: Review pending manufacturing changes and Review pending metadata changes. Each chooses that whole-finding classification, enables pending-only and clears search. Preserve the currently visible finding if it remains eligible; otherwise use the first matching pending finding in comparison order. Disable a shortcut when the shared global count has zero pending findings of its class, including no findings or an entirely acknowledged class.

Reuse existing classification/pending/search controls and shared derived counts. This is navigation only: do not mark edits, cancel pending imports, acknowledge items, alter notes or shrink exports. The existing pending-only control applies to output and limitation checklists too, as usual. Keep count table columns and printable HTML unchanged. No formal approval or completion claims.

Validate mixed classes, hidden search results, retained eligible selection, all-acknowledged disabled classes, empty classes, complete exports and unchanged edited callbacks. Mutate each filter setting and the zero-pending guard, expect assertion failures, restore backups. Run required unit/type/lint/build and focused Chromium checks before publishing. Start independently from integrated #98 and target main once its authorized merge completes.
