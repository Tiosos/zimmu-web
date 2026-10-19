# Cabinet layout reuse

- Next batch focuses on fifteen section-design reuse/refinement commands, building on PR #141 rather than adding another layout preset collection.
- Pure tree transformations preserve the destination root identity/size and unrelated branches. Only full paste creates fresh descendant IDs. Mirror retains physical identities and reverses matching axes; single door handing changes only for left/right mirror.
- Clipboard ownership stays in SectionToolbar, above its no-selection return, so selection changes and geometry regeneration do not discard the copied snapshot. It intentionally remains in memory rather than extending the project format.
- Partial paste and repeat are leaf-only. Repeating into mixed leaf/group siblings is disabled to avoid flattening or silently interpreting nested contents.
- Independent face-frame layouts can override structural section fronts. Structural/front edits clear only affected section-keyed overrides; shelving edits retain them. Controls disclose this before applying.
- Reuses the existing validated commit path and explicit history labels. Extended drawer-fit validation to take current drawer components, because testing defaults during a mirror or shelf-only edit could disagree with retained drawer configuration. New drawer IDs continue to use generator defaults.
- Lock sizes uses the resolved geometry without rounding, avoiding cumulative dimensional drift. Assertions use numeric tolerance for fractional spans.

- Sixteen deliberate mutations verify snapshot isolation, fresh identity, destination sizing, leaf-only paste/repeat, mirror order/handing, selective cleanup, frame scope, lock-axis/invalid geometry guards, recursive equalizing, retained drawer parameters and navigation boundaries. The initial mixed-sibling repeat fixture had only one leaf, making the extra guard redundant for that example; added a third leaf, confirmed the original green run and the expected assertion failures, then restored from backups.

- Final validation: 192 unit-test files passed, 3,422 tests passed and 10 skipped. All four Chromium workflows passed, including the two existing layout workflows. Typecheck, lint, production build and catalogue service build passed. The first new browser run used an incorrect button locator for the cabinet dropdown; corrected it to the established creation flow and reran successfully.
