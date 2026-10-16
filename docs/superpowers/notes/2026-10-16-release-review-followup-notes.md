# Release review follow-up notes

Follow-up fixes to the release change report and local review draft work (PR #132). Later groups
append here.

## Group 1: comparison correctness and repeated work

- 2026-10-16 — `compareReleaseSource` validated the frozen source with a literal `version: 28`. It
  now passes `FILE_FORMAT_VERSION`. A test that only compared against the constant could not fail
  while both are 28, so `compareReleaseSource.version.test.ts` mocks the constant to 9999 and
  requires `validateCurrentFile` to receive that; putting the literal back fails it.
- 2026-10-16 — `descriptors()` paired `inventory.parts[i]` with `scene.parts[i]` and `records[i]`
  by position, relying on `buildPacketPartInventory` keeping `manufacturingParts`' order. It now
  joins by part id. An inventory part with no source part throws naming the id, and an inventory
  whose length differs from the scene's throws; both reach the dialog's existing "Comparison
  unavailable" path. A separate duplicate-id check on the scene was not added: the existing
  `add()` duplicate check plus equal length plus every id resolving already makes the join a
  bijection, so a second check would be untestable. Tests reverse the inventory (result must equal
  the unshuffled one, which is only distinguishable because the fixture changes one part's colour)
  and drop or rename one inventory part.
- 2026-10-16 — The two `canonical()` helpers in `compareReleaseSource.ts` and
  `resumeChangeReview.ts` are now one, `canonicalJson` in `src/ui/canonicalJson.ts`. They differed
  only for `undefined`: the comparison kept `"k":undefined` and array `undefined`; resume dropped
  the key and wrote `null`, as `JSON.stringify` does. The shared helper keeps resume's rule,
  because resume compares a fresh report against its own saved JSON and must treat a value as equal
  to its serialisation. That changes nothing for the comparison on real inputs: its inputs are
  `JSON.parse`d sources and projections built from them (the inventory, `operations`, generated
  hardware rows), none of which holds a nested `undefined` — every optional field is either
  validated as present, normalised with `?? null`, or spread conditionally. A top-level
  `undefined` (a field missing on one side) is `'undefined'` under both rules. A scratch scan over
  both fixtures' inventories and operations found no nested `undefined`. Neither helper's output
  is persisted (both are used only for equality), so no stored hash or fingerprint depends on it.
  `canonicalJson.test.ts` keeps verbatim copies of both old helpers as oracles over a table of
  parsed JSON values (unsorted keys, unicode/escapes, -0, floats, 1e21, empty containers) and
  requires byte-identical output to both. Mutating the `undefined` handling is killed only by the
  oracle test of `undefined`, not by any resume test, which is consistent with `undefined` never
  reaching resume either. The other `canonical()`-style helpers (packet comparison, revision
  review, packet verification, output reconciliation) belong to other features and were left alone.
- 2026-10-16 — `buildReleaseChangeReport` takes an optional fifth argument, the comparison the
  caller already computed, and the dialog's export passes its memoised `result.report`. The source
  hash check against `release.sourceSha256` and the single hash of the live source are unchanged
  and still run when a comparison is supplied (tested). The caller contract — the supplied
  comparison is exactly `compareReleaseSource(release.source, currentSource)` — is stated at the
  parameter rather than checked, since checking it would mean comparing again.
- 2026-10-16 — `localChangeReviewContext` and `useLocalChangeReview` take the same optional
  comparison, and the dialog passes `result.report`, so opening the dialog compares the sources
  once. Key and fingerprint are unchanged: the new test recomputes both with the pre-change
  derivation and requires equality, and the context equals the one built without a comparison.
- Deliberately not done: `resumeChangeReview` still recomputes its fresh report. Resuming is an
  explicit, rare action and that function's behaviour belongs to another group. The report builder
  still `JSON.parse`s both sources to read `projectName`; removing that would mean changing
  `SourceComparison`, which is spread into the exported report.
