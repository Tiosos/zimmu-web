# Persisted release record

Stage 6.2, slice 1. Plan: `../plans/2026-09-29-design-to-manufacturing-architecture.md` (Stage 6). Notes: `../notes/2026-10-14-persisted-release-record-notes.md`.

The release gate (2026-10-10) assesses a final ZIP and exports a sidecar JSON. Nothing is stored in the project, so production cannot later identify or reproduce the revision it received. This slice records a release in the `.zimmu` file together with a frozen copy of the source the packet was built from.

## Scope

In: record a release, persist it, show the list, detect a tampered snapshot on load.
Out (later slices): workflow registration and acknowledgement, withdrawal, opening a snapshot as a project copy, verified identity. A recorded release is not "current" in the plan's sense until the workflow system acknowledges it.

## Data model

`ZimmuFile.releases?: ProductionRelease[]`, top level. Not in `Scene` (a snapshot must not contain itself), not in `ProjectStructure` (project history must not be able to undo a release). Counted in dirty tracking.

```ts
interface ProductionRelease {
  id: string
  revision: number            // max existing + 1, never reused
  releasedBy: string          // trimmed, 1-100 chars
  identity: 'self-declared'   // CAD has no verified identity
  releasedAt: string          // ISO
  packetSha256: string
  sourceSha256: string
  assessment: ProductionReleaseRecord   // status 'technically-ready' or 'review-required' (amendment 2026-10-16)
  acknowledgedReviewItems?: number      // review-required findings acknowledged (amendment 2026-10-16)
  source: string              // exact JSON.stringify({scene,projectName,hardwareLibrary,materialLibrary}) captured at export
}
```

"Superseded" is derived (every entry but the highest revision), not stored. `FILE_FORMAT_VERSION` 27 -> 28; a file without `releases` parses unchanged.

Identity and ordering:
- `id` is `crypto.randomUUID()`. `revision` is **file-local**: two copies of a file that each record a release both get N+1, so a revision number means something only within one file lineage. Anything that must identify a release across files (the next slice's handoff contract) keys on `packetSha256`.
- `parseFile` requires unique `id` and unique `revision`; a later duplicate is treated as unreadable (below).
- The array is stored in revision order.

Size: `source` is the full scene, so the file holds one scene per release. Slice 1 does not deduplicate or compress; `recordRelease` refuses a `source` over 16 MiB, and the list shows each release's size. Compression or delta storage is deferred (see notes).

`source` is a string, not a nested object: serialisation rounds floats to 6 dp, which would change the hash on reload. A string is untouched, so `sha256(source) === sourceSha256` holds forever.

## Recording rules

`recordRelease(releases, input)` is pure and returns the new array or a refusal reason. It refuses when:

1. *(Superseded by the 2026-10-16 amendment below: blocked refuses, review-required needs an explicit acknowledgment.)* `assessment.status !== 'technically-ready'` (blocked and review-required both refuse; no exception bypass). A packet whose manifest lacks a valid `sourceSha256` already fails the verifier's integrity inspection and so is `blocked`; the gate additionally reads the hash from the verified manifest and offers recording only when it is a 64-hex string.
2. The live capture's SHA-256 differs from the packet manifest's `sourceSha256` (model changed since export).
3. The name is empty after trimming or over 100 characters.
4. `packetSha256` is already recorded in any release, or `sourceSha256` equals the **newest** release's (nothing changed since the last release). Only the newest is compared: A -> B -> A is a legitimate new revision, and an empty `releases` array has nothing to collide with.
5. The captured `source` exceeds 16 MiB.
6. The file already holds 25 entries (`MAX_RELEASES`; readable or not): each entry is a whole scene, so the file must not grow without bound.

It never mutates an existing entry.

## Integrity on load

`parseFile` is synchronous and stays so: it validates **structure** only (field types, 64-hex digests, unique `id`/`revision`). Hash checking is async (`crypto.subtle`), so `verifyReleases(releases)` runs after a file loads and its result is held in `useFile` state; the list shows "checking" until it resolves, and a file never waits on it to open.

- A readable entry must carry a complete assessment (findings, limitations, revision block, `formalApproval: 'not-recorded'`) and a source within the size cap; fields this build does not know are kept so a save-as-copy of a newer file loses nothing from an entry. JSON validity of `source` is not checked; the hash ties it to what was captured.
- A hash mismatch keeps the entry and marks it **corrupted**; nothing is dropped silently.
- A structurally malformed or duplicate entry does not fail the whole file. It is kept as `{ unreadable: true, raw }`, shown as unreadable, and preserved as read on save (the serializer's 6 dp number rounding still applies to numbers inside it), so one damaged entry neither bricks the project nor destroys the other releases.
- The check detects **accidental corruption only**. The digests live in the same editable file as the data they cover, so someone who edits `source` can recompute `sourceSha256`, and `packetSha256`, `assessment` and `releasedBy` are not covered at all. UI wording is "integrity check", never "tamper-proof" or "verified", and the notes say so. Authenticity needs the workflow system's registration receipt (a later slice).

`source` is authoritative. The saved scene is rounded to 6 dp and the frozen `source` is not, so the live scene can never be byte-compared to a release. Reproduction (later) must load from `source`.

Older builds: a v27 build opening a v28 file drops `releases` on save, because it only warns and parses its own fields. Builds already shipped cannot be fixed. From this version on, a file whose version is **newer** than the app is saved only as a new copy (the existing migration path), so a future build cannot silently strip fields it does not know.

## Code shape

- `src/scene/releases.ts`: types, `recordRelease`, `verifyRelease`. No React, no Node.
- `buildProductionPacket.ts`: the existing capture step is extracted so the gate computes the same source string the packet hashed. No behaviour change to the packet.
- `useFile.ts`: carries `releases` beside `project`, outside undo history; v28 parse and write. Dirty tracking compares the `releases` array **by reference** (entries are immutable and the array is replaced on record), never by `JSON.stringify`, so scene edits do not serialise every release. Files newer than the app open as save-as-copy only.
- `ProductionReleaseGate.tsx`: "Released by" field and Record release button (hash-matched and not blocked; review-required also needs the acknowledgment box, per the 2026-10-16 amendment), mismatch message, read-only list with an unverified label and altered badge. Wording is "recorded", never "approved"; formal approval stays `not-recorded`.

## Tests (written first)

v28 round trip; v27 file loads with no releases; float-heavy source keeps its hash across save/load; corrupted source flagged; malformed and duplicate entries are preserved by a save and do not block opening; newer-than-app file saves as copy only; dirty tracking reacts to a recorded release but not to a scene edit's cost (reference compare); save after release leaves `source` byte-identical; undo does not remove a release; each refusal rule in `recordRelease`; gate UI states (hidden when blocked; review-required needs the acknowledgment, per the 2026-10-16 amendment; mismatch message, name required, duplicate). Every guard gets a deliberate mutation per CLAUDE.md. Run typecheck, lint, full suite and the browser packet workflow.

## Docs

This spec, the notes file, and Stage 6 of the architecture plan updated. `CLAUDE.md`: the format-version line says 26 but the code was already 27 (v27 is the manufacturing-record increment and is missing from the history list); add v27 and v28 to that list, add `releases.ts` to the architecture tree, and add the invariants: releases live outside `Scene` and project history; `source` is stored as a string because of 6 dp rounding; integrity detects accidental corruption only; revision is file-local. Run `scripts/update-structure-html.mjs` after adding files.

## Amendment 2026-10-16: recording a review-required assessment

Rule 1 above made recording unreachable. `assessProductionRelease` returns `technically-ready` only with **zero** findings, and every real packet carries the five constant unassessed items of `manufacturing.unassessed` (`src/scene/manufacturingChecks.ts`) plus the machining-reconciliation unassessed items, so a clean Base 600 assesses as `review-required` with 9 review items and 0 blockers. The Record button never appeared in real use. The product owner decided to allow recording a review-required assessment when the releaser explicitly acknowledges the open review items.

Corrected rule 1 (checked first, before any digest check):

- `status === 'blocked'`, or any finding with category `blocker` -> refuse `not-ready`. A blocked packet never records, acknowledged or not.
- `technically-ready` -> records with `acknowledgedReviewItems: 0`.
- `review-required` -> refuse `review-not-acknowledged` unless `RecordReleaseInput.acknowledgeReview === true`; with it, records with `acknowledgedReviewItems` = the number of findings with category `review-required`.

Rules 2 to 6 are unchanged and keep their order.

Stored fields: `ProductionRelease.acknowledgedReviewItems?: number`, a non-negative safe integer. It is optional and additive: an absent value means 0, so every release a v28 build already wrote (all technically ready) still parses. `FILE_FORMAT_VERSION` stays 28. An already-shipped v28 build treats a review-required release as an unreadable entry and preserves it as read: no data is lost, it just shows "Unreadable entry, preserved".

Parse consistency (a record that contradicts itself is unreadable, kept as `{ unreadable: true, raw }`): `assessment.status` must be `technically-ready` or `review-required`; every finding must be a record whose `category` is `blocker` or `review-required`; no finding may be a `blocker`; a `technically-ready` record must list no findings and carry `acknowledgedReviewItems` absent or 0; a `review-required` record must list at least one `review-required` finding and carry `acknowledgedReviewItems` equal to that count. Every earlier guard stays. `recordRelease` refuses the same contradictions at write time (`not-ready`: a ready assessment listing findings, a review-required one with no review items, any finding that is not `review-required`), so a recorded release always reloads.

UI: the gate offers recording for any non-blocked, hash-matched assessment. For `review-required` it shows a checkbox labelled `I have reviewed the N open review items in this assessment` (`1 open review item` in the singular), and Record release stays disabled until a name is typed and the box is ticked; it is cleared whenever the assessment resets. The explanation under the controls reads: "Recording stores a frozen copy of this project and this assessment, including the open review items, in the file. The name is typed, not verified, and this is not formal approval." When the findings shown are truncated at 200, "(the release record lists all of them)" follows "the open review items". The release list shows "Recorded with N open review items acknowledged" for a release with N > 0. Formal approval stays `not-recorded`, and no wording implies approval.

The browser test now records a release mandatorily: a review-required Base 600 packet is recorded, which is the first real-browser proof that the live capture hashes to the packet manifest's `sourceSha256`.
