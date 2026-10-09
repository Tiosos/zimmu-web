# Pending-first revision checklists — notes

- Sorts only the newly built filtered view array; acknowledgment arrays and comparison targets retain recorded order. Stable JavaScript sorting preserves order among equal acknowledgment states.
- Each group has an independent unsaved toggle, off by default, consistent with the part-summary ordering control.
- Validation: typecheck, lint, 172 unit files / 2,962 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Five deliberate regressions produced assertion failures: acknowledged-first ordering, coupled group preferences, ignored toggles, reversed subgroup order and broad shortcut focus selection. Source restored byte-for-byte from `/tmp/checklist-order-ui.bak`.

- Existing shortcut-focus tests caught the new view checkbox being selected as an acknowledgment. Shortcuts now target an explicit acknowledgment marker, avoiding other checklist controls.
