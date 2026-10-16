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

## Group 2: the comparison dialog's lifecycle and controls

- 2026-10-16 — App rendered the comparison only while `releases.includes(comparisonRelease)` and
  that index's integrity was `'ok'`. `releaseIntegrity` is `null` whenever the `releases` array
  changes identity (recording a release, opening a file), so recording a release from the verifier
  unmounted the dialog, and reopening the same file failed `includes` for good. App now finds the
  release by `id` and `sourceSha256` and keeps the dialog while that entry's integrity is `'ok'` or
  still being checked (`null`). The dialog keeps receiving the stored object it was opened with:
  an entry with the same id and source hash has, once verified, the same source text. A same-id
  entry with a different source hash counts as a different release. When the release is gone or
  verified as not `'ok'`, App clears `comparisonRelease` during render (the
  `react-hooks/set-state-in-effect` rule refuses the effect form), so reopening a file that holds
  the release does not bring the dialog back on its own — before, it did.
- 2026-10-16 — The premise that an unmount loses edits since "the last autosave tick" was only
  partly right: there is no tick. Every draft change starts its write in an effect immediately,
  and the store queue lets it finish after unmount, so an ordinary edit followed by an unmount
  is kept (tested, real fake-indexeddb). What was lost was an edit made after an autosave
  failure: the hook writes again only on Retry, so on unmount the draft existed only in memory.
  `useLocalChangeReview` now makes one best-effort write of an unsaved draft in its unmount
  cleanup. It cannot prompt there, and if storage still fails the edit is lost as before; a
  failure is swallowed because nothing is left on screen to report it to. App-level tests mock
  the dialog and count mounts; whether an unmount keeps the draft is the dialog-level test in
  `ReleaseSourceComparison.autosave.test.tsx`.
- 2026-10-16 — The unmount write would also save a review the user had just confirmed
  discarding through `canLeave()`, bringing it back on the next open once storage recovered. An
  accepted discard now calls the hook's `discard()`, which marks that draft by identity so the
  unmount write skips it; the next edit is a new draft and is saved again, and a new dialog starts
  with no mark. A cancelled discard and a forced close without a prompt still write on unmount.
- 2026-10-16 — Resuming from a downloaded report asked `canLeave()`'s "Discard review edits since
  your last report download?", which is about leaving, not replacing, and says nothing about the
  autosaved draft that accepting overwrites on the next autosave. Resume now has its own prompt —
  replace the current review with the uploaded report, and the draft saved in this browser with it
  — asked whenever the current review has edits. It is asked even when that review was already
  downloaded, which the old prompt skipped: the download is a copy, but the local draft is still
  replaced. An untouched review is replaced without a prompt, as before. Cancel was already
  side-effect free; the new test proves it against the real store (no write after cancel, the
  saved draft still reads back) rather than only the on-screen value.
- 2026-10-16 — `canLeave()`'s text was kept for Close and Show. `leave()` reaches it only when the
  edits are *not* safe locally — autosave reports an error, or the explicit flush failed — so
  "discard … download a report first to keep them" is accurate there, and an autosaved review
  closes without any prompt.
- 2026-10-16 — `leave()` flushed once and, if the edit version moved during the flush, returned
  without acting or saying anything, so Close or Show looked dead. It now flushes up to three
  times while the version keeps moving, then applies the usual guard; if the review is still
  changing after the third, it shows a `role="status"` message asking to try again. The review's
  premise was right, with one gap it did not name: `autosave.flush` closed over the draft of the
  render that created it, so a retry from the same `leave()` call would have re-saved the stale
  draft and then closed with the newest edit unsaved. `flush` now reads the hook's latest draft and
  context through a ref (the same one the unmount write uses); the hook test takes a flush from an
  earlier render and requires it to write the later draft. A change of *comparison* during the
  flush still returns silently: that is a different context, the dialog re-renders for it, and
  the button works on the next click. The message is cleared at the start of every leave.
- 2026-10-16 — A finding rendered one "Show <part>" button per linked part, each resolved with
  `scene.parts.find`. A generated hardware row links every board of its cabinet (`partIds` is
  every inventory record with that `cabinetId`), so one hinge-count change put a cabinet's worth
  of buttons on the finding, and a job's worth of such findings made the lookup quadratic. Each
  finding now shows the first five resolvable parts and a "Show N more parts" toggle
  (`aria-expanded`) that reveals the rest; labels resolve through one `Map` memoised on
  `scene.parts`. The limit counts parts that exist, so a removed part neither renders nor inflates
  "N more". Button names and the `leave()` path are unchanged for findings of five parts or fewer,
  which covers the existing unit tests and `e2e/release-source.spec.ts`. The `Map` is a
  performance change no test can distinguish from `find`; only the cap, the toggle and the ids
  the buttons pass were mutation-tested.

## Group 3: release status cost and the second IndexedDB database

- 2026-10-16 — `ReleaseStatus` (mounted for the whole session in App) captured the production
  source (a `structuredClone` plus `JSON.stringify` of the whole job) and hashed it on every
  committed scene, project-name or library change, on the main thread. The check now runs on a
  trailing timer, `RELEASE_CHECK_DELAY_MS = 400`, restarted by every change and cleared on
  unmount, so a drag or a typed dimension captures once after the edits settle. 400 ms is long
  enough to cover a burst of keystrokes or drag commits and short enough that the bar catches up
  before anyone reads it; it is a feel figure, not a measured one. The first check after mount
  also waits the delay ("Checking changes since release…" meanwhile). The existing `active` flag
  still discards an older hash finishing after a newer change.
- 2026-10-16 — While a newer check is pending, the bar keeps the last result only when it was
  `changed` against the same latest release: "Unreleased changes since revision N" stays
  practically true across further edits, and dropping to "Checking…" on every keystroke was a
  flicker. A last `matches` is not kept — the new edit may well have broken the match — and
  neither is `error` or a result against a different release; those show "Checking…".
- 2026-10-16 — The obsolete-hash test now waits for the first hash to start before changing the
  input: with the debounce, an immediate rerender cancels the first check, so the old test no
  longer reached the out-of-order case at all. The new tests use fake timers and a stubbed
  `sha256Hex` (a real `crypto.subtle` digest resolves on the real event loop, which fake-timer
  `waitFor` does not drive). Mutations, predicted and observed: calling `compare()` directly
  failed the burst, pending-keep and unmount tests (6 captures, 2 hashes, 1 capture); keeping a
  pending `matches` failed "stops claiming a match" and the existing board-edit test;
  removing `clearTimeout` failed the burst and unmount tests, and also the obsolete-hash test
  (the uncancelled first check hashed a second time), which was not predicted but is the same
  defect; disabling the `active` guard failed the obsolete-hash test.
- 2026-10-16 — `localChangeReviewStore.ts` opens its own IndexedDB database,
  `zimmu-review-drafts` (store `drafts`, version 1), rather than a store in `idb.ts`. It stays
  separate: moving it into `idb.ts` would mean `DB_VERSION` 5 plus a one-off copy from the old
  database, and any draft not copied (a failed or interrupted migration, a second tab on the old
  build) would be orphaned in users' browsers with no way back. Only CLAUDE.md changed — the
  IndexedDB invariant and the `idb.ts` tree entry now say the drafts live in that separate
  database, hold reviewer names and notes, are capped at `MAX_LOCAL_CHANGE_REVIEWS`, and are not
  part of the `idb.ts` schema nor cleared with the library or settings.
- Not fixed: the review's formatting-churn finding (unrelated reformatting in `ReleaseList.tsx`,
  long unformatted JSX in `App.tsx`). The repo's Prettier hook formats every edited file, so
  reverting that churn would fight the hook on the next edit; left as is.
