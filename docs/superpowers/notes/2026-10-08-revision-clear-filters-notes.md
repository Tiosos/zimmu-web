# Clear revision navigation filters notes

- 2026-10-08: Builds on #96 so one action can reset classification, search and pending-only consistently. #97 remains independent and is undergoing CI. Clearing navigation never saves or edits review contents.
- Focused tests: 21 passed. Each omitted reset (search/classification/pending), a permanently disabled button and omitted active-selection preservation produced predicted assertion failures. Restored the component from a byte-verified backup after every mutation.
- A whitespace-only query enables clearing even though normalized search does not narrow the list. Capturing the active visible reference before reset avoids jumping back to a hidden stale selection. An empty result resets selection to the first complete-list finding.
- Validation: all 172 unit files passed (2,921 tests passed, 10 existing skips). Typecheck, lint, catalogue build, CAD build and real Chromium packet-comparison/export test passed. The browser clears all three controls from a zero-match view and continues reviewing successfully.
