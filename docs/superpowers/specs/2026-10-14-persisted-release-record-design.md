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
  assessment: ProductionReleaseRecord   // status 'technically-ready'
  source: string              // exact JSON.stringify({scene,projectName,hardwareLibrary,materialLibrary}) captured at export
}
```

"Superseded" is derived (every entry but the highest revision), not stored. `FILE_FORMAT_VERSION` 27 -> 28; a file without `releases` parses unchanged.

`source` is a string, not a nested object: serialisation rounds floats to 6 dp, which would change the hash on reload. A string is untouched, so `sha256(source) === sourceSha256` holds forever.

## Recording rules

`recordRelease(releases, input)` is pure and returns the new array or a refusal reason. It refuses when:

1. `assessment.status !== 'technically-ready'` (blocked and review-required both refuse; no exception bypass).
2. The live capture's SHA-256 differs from the packet manifest's `sourceSha256` (model changed since export).
3. The name is empty after trimming or over 100 characters.
4. `packetSha256` is already recorded, or `sourceSha256` equals the newest release's (nothing changed).

It never mutates an existing entry.

## Integrity on load

`parseFile` re-hashes each `source`. A mismatch keeps the entry and marks it altered in the UI; nothing is dropped silently. Malformed entries fail closed with a parse error naming the field.

## Code shape

- `src/scene/releases.ts`: types, `recordRelease`, `verifyRelease`. No React, no Node.
- `buildProductionPacket.ts`: the existing capture step is extracted so the gate computes the same source string the packet hashed. No behaviour change to the packet.
- `useFile.ts`: carries `releases` beside `project`, outside undo history; v28 parse and write.
- `ProductionReleaseGate.tsx`: "Released by" field and Record release button (ready and hash-matched only), mismatch message, read-only list with an unverified label and altered badge. Wording is "recorded", never "approved"; formal approval stays `not-recorded`.

## Tests (written first)

v28 round trip; v27 file loads with no releases; float-heavy source keeps its hash across save/load; tampered source flagged altered; save after release leaves `source` byte-identical; undo does not remove a release; each refusal rule in `recordRelease`; gate UI states (hidden when blocked or review-required, mismatch message, name required, duplicate). Every guard gets a deliberate mutation per CLAUDE.md. Run typecheck, lint, full suite and the browser packet workflow.

## Docs

This spec, the notes file, Stage 6 of the architecture plan updated, and the stale `CLAUDE.md` format-version line corrected (it says 26; code is 27 before this change). Run `scripts/update-structure-html.mjs` after adding files.
