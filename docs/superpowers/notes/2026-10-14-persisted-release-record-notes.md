# Persisted release record - notes

**Spec:** `../specs/2026-10-14-persisted-release-record-design.md`

- 2026-10-14: `CLAUDE.md` said format version 26; `useFile.ts` was already 27. This slice makes it 28.
- Decided with the user: snapshot plus metadata (not metadata-only, not an embedded ZIP); self-declared releaser labelled unverified; only `technically-ready` can be recorded.
- Rejected: freezing whatever is live at click time (snapshot could differ from the ZIP); recording at export time (changes the workflow, too large for a slice).
- `source` is stored as a string because 6 dp float rounding on save would otherwise break `sourceSha256`.
- `releases` sits outside `Scene` and `ProjectStructure` so neither self-containment nor project undo can touch it.
- Deferred: registration/acknowledgement, withdrawal, open-snapshot-as-copy, verified identity.
- Max-level review (same day) found nine issues, all verified against the code and folded into the spec: sync `parseFile` vs async hash (verification moved out of parse); integrity wording limited to accidental corruption; malformed entries kept as unreadable instead of failing the file; older-build data loss (future builds save newer files as copy only); dirty tracking by reference and a 16 MiB source cap; file-local revision numbers; explicit refusal cases and A -> B -> A; `source` authoritative over the rounded saved scene; CLAUDE.md needs v27 and v28 history, tree entry and invariants.
- Deferred: compressing or delta-storing release sources; the size budget is a simple cap for now.

## Implementation (2026-10-14)

- The gate inspects the packet a third time to read the manifest's `sourceSha256` (`packetSourceSha256`). Accepted: it runs once per deliberate assess click, and reusing the earlier inspection would change `assessProductionRelease`'s API.
- Unreadable entries are written back as `raw`, but `raw` passes through the save's 6 dp number replacer, so a number in a damaged entry can change on re-save. Hence the UI says "preserved as read", never "unchanged".
- A save-as-copy of a file newer than this build keeps unknown fields on release entries (they are kept as read), but not on parts of the file this build does not know; those are dropped from the copy, which is why the original is never overwritten.
- `releasesForFile` writes a non-array `releases` value back as a one-element array (an unreadable entry) on first save; stable thereafter.
- `verifyReleases` rejects when `crypto.subtle` is unavailable (insecure context), so every status stays "checking". Accepted: the app already needs `crypto.subtle` elsewhere (packet hashing).
- `recordRelease` in `useFile` compares the release list by reference, so a record still in flight when a file is opened or a new file started returns `stale` rather than writing into the other file.
- The `setRecordable(null)` in the gate's `reset` is an equivalent mutant (removing it changes no observable behaviour). The `fileReady` guard in `App` is belt-and-braces: `App` returns `null` before `fileReady`, so the guard cannot be reached false.
- Pre-existing, not changed here (suggested follow-up): `saveFile`/`saveAsFile` set `lastSavedSceneRef` from `sceneRef.current` after their awaits, so a scene edit made during a write is marked saved. The releases baseline is captured before the await to avoid exactly this.
- E2E (`e2e/production-packet-integrity.spec.ts`, Chromium 1194 via `PW_CHROMIUM_EXECUTABLE`): passed. The Base 600 packet is **not** technically ready, so the not-ready branch ran — recording was not offered (`Record release` count 0). The ready branch (record, list, integrity passed) is covered by unit tests only.
- Final verification: typecheck, lint, build and `build:catalogue` exit 0; `pnpm test` exit 1 with 178 files (177 passed, 1 failed), 3,119 passed, 1 failed, 10 skipped. No mutation in Task 8 surprised.
- The one failure, `verifyProductionPacket.test.ts` "verifies Unicode IDs…", is pre-existing and environmental: Node 22.22's `TextDecoder('windows-1252')` decodes byte 0x97 as U+0097 (ISO-8859-1 behaviour) instead of the WHATWG em dash U+2014, so the part ID `部件—é` read back from the PDF does not match and the verifier reports `printed-part-missing`.
- Deferred per the spec: registration/acknowledgement, withdrawal, open-snapshot-as-copy, verified identity, compression of release sources.
