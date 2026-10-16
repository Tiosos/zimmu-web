# Persisted release record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a technically-ready production release in the `.zimmu` file together with a frozen copy of the source the packet was built from, list recorded releases, and flag corrupted or unreadable entries on load.

> **Amended 2026-10-16:** a `review-required` assessment can also be recorded once the releaser acknowledges its open review items; `blocked` still refuses. See the amendment in the spec and notes. The steps below are the plan as executed on 2026-10-14.

**Architecture:** A browser-safe module `src/scene/releases.ts` owns the types, structural parsing, SHA-256 verification and the pure-ish `recordRelease` rules. `useFile` carries `releases` beside `project` (outside undo history, compared by reference for dirty tracking). The existing release gate dialog gains a "Released by" field and a Record button that is offered only when the live source hashes to the packet manifest's `sourceSha256`.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom + Testing Library, `crypto.subtle` SHA-256, fflate (existing), Playwright (one e2e addition).

**Spec:** `docs/superpowers/specs/2026-10-14-persisted-release-record-design.md` · **Notes:** `docs/superpowers/notes/2026-10-14-persisted-release-record-notes.md`

**Rules for the whole plan**
- Develop on branch `claude/gracious-johnson-vuxgyj`. Never commit to `main`.
- Commit messages end with the two attribution lines the session requires (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh`).
- Test files that you write or edit are run automatically by a hook; still run the commands shown.
- Before **every** commit run `pnpm typecheck && pnpm lint && pnpm test` and read the result (CLAUDE.md rule; a pre-commit hook also typechecks). The narrower `pnpm vitest run <file>` commands inside each task are for the red/green loop only, never a substitute at commit time.
- Mutation testing (CLAUDE.md): back the file up with `cp file "$SCRATCHPAD"/name.bak`, never `git checkout` to undo, grep after applying and after restoring, predict which tests fail. Each task that adds a guard lists its mutations.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/scene/releases.ts` | create | Types, `sha256Hex`, `parseReleases`, `releasesForFile`, `verifyReleases`, `recordRelease` |
| `src/scene/releases.test.ts` | create | Unit tests for all of the above |
| `src/scene/__fixtures__/release.ts` | create | `readyAssessment`, `makeRelease` shared by scene and UI tests |
| `src/scene/types.ts` | modify | `ZimmuFile.releases?: ReleaseEntry[]` |
| `src/scene/useFile.ts` | modify | v28, parse/write `releases`, state, `recordRelease`, integrity state, dirty tracking, newer-file-saves-as-copy |
| `src/scene/useFile.test.ts` | modify | v28 pins, new release tests |
| `src/ui/buildProductionPacket.ts` | modify | Extract `captureProductionSource` (same text the manifest hashes) |
| `src/ui/buildProductionPacket.test.ts` | modify | Capture equals manifest hash; `packetSourceSha256` tests |
| `src/ui/productionReleaseGate.ts` | modify | `packetSourceSha256(packet)` |
| `src/ui/ReleaseList.tsx` + `.test.tsx` | create | Read-only list with integrity labels |
| `src/ui/ProductionReleaseGate.tsx` | modify | Record controls |
| `src/ui/ProductionReleaseGateRecording.test.tsx` | create | Gate recording UI tests |
| `src/ui/ProductionPacketVerifier.tsx` + test | modify | Pass `recording` through; show the list |
| `src/App.tsx` | modify | Wire `useFile` releases and source capture into the verifier |
| `e2e/production-packet-integrity.spec.ts` | modify | Browser workflow |
| `CLAUDE.md`, architecture plan, `project-structure.html` | modify | Docs |

---

### Task 1: `releases.ts` types, hashing, parsing, verification

**Files:**
- Create: `src/scene/releases.ts`, `src/scene/__fixtures__/release.ts`, `src/scene/releases.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/__fixtures__/release.ts`:

```ts
import { sha256Hex, type ProductionRelease } from '../releases'
import type { ProductionReleaseRecord } from '../../ui/productionReleaseGate'

export const readyAssessment = (packetSha256: string): ProductionReleaseRecord => ({
  schemaVersion: 1,
  kind: 'production-release-assessment',
  assessedAt: '2026-10-14T00:00:00.000Z',
  packetSha256,
  status: 'technically-ready',
  formalApproval: 'not-recorded',
  revision: { mode: 'initial', beforeSha256: null, reviewSha256: null },
  findings: [],
  limitations: [],
})

export const SOURCE_A = JSON.stringify({
  scene: { parts: [] },
  projectName: 'Kitchen',
  hardwareLibrary: {},
  materialLibrary: {},
})

export async function makeRelease(
  overrides: Partial<ProductionRelease> = {},
): Promise<ProductionRelease> {
  const source = overrides.source ?? SOURCE_A
  const packetSha256 = overrides.packetSha256 ?? 'a'.repeat(64)
  return {
    id: 'rel-1',
    revision: 1,
    releasedBy: 'Sam Designer',
    identity: 'self-declared',
    releasedAt: '2026-10-14T01:00:00.000Z',
    packetSha256,
    sourceSha256: await sha256Hex(source),
    assessment: readyAssessment(packetSha256),
    source,
    ...overrides,
  }
}
```

Create `src/scene/releases.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_RELEASE_SOURCE_BYTES,
  parseReleases,
  releasesForFile,
  sha256Hex,
  verifyReleases,
  type UnreadableRelease,
} from './releases'
import { makeRelease, readyAssessment } from './__fixtures__/release'

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

describe('sha256Hex', () => {
  it('matches the published digest of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('parseReleases', () => {
  it('treats an absent field as no releases', () => {
    expect(parseReleases(undefined)).toEqual([])
  })

  it('returns well-formed entries unchanged', async () => {
    const release = await makeRelease()
    expect(parseReleases(roundTrip([release]))).toEqual([release])
  })

  it('keeps a non-array value as one unreadable entry instead of throwing', () => {
    expect(parseReleases('oops')).toEqual([{ unreadable: true, raw: 'oops' }])
  })

  it.each([
    ['a missing id', { id: undefined }],
    ['a non-positive revision', { revision: 0 }],
    ['a fractional revision', { revision: 1.5 }],
    ['an empty name', { releasedBy: '   ' }],
    ['a name over 100 characters', { releasedBy: 'x'.repeat(101) }],
    ['a verified identity claim', { identity: 'verified' }],
    ['an invalid date', { releasedAt: 'yesterday' }],
    ['a short packet digest', { packetSha256: 'abc' }],
    ['a short source digest', { sourceSha256: 'abc' }],
    ['a non-string source', { source: 42 }],
  ])('keeps an entry with %s as unreadable, with its raw value', async (_label, patch) => {
    const bad = roundTrip({ ...(await makeRelease()), ...patch })
    expect(parseReleases([bad])).toEqual([{ unreadable: true, raw: bad }])
  })

  it.each([
    ['no findings list', { findings: undefined }],
    ['no limitations list', { limitations: undefined }],
    ['no revision block', { revision: undefined }],
    ['an unknown revision mode', { revision: { mode: 'other' } }],
    ['an approval claim', { formalApproval: 'approved' }],
  ])('rejects an assessment with %s', async (_label, patch) => {
    const release = await makeRelease()
    const bad = roundTrip({ ...release, assessment: { ...release.assessment, ...patch } })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects a source over the size cap', async () => {
    const bad = roundTrip({
      ...(await makeRelease()),
      source: 'x'.repeat(MAX_RELEASE_SOURCE_BYTES + 1),
    })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('keeps fields it does not know, so a copy of a newer file loses nothing from an entry', async () => {
    const release = await makeRelease()
    const withExtra = roundTrip({
      ...release,
      withdrawnAt: '2026-11-01T00:00:00.000Z',
      assessment: { ...release.assessment, extra: 1 },
    })
    expect(parseReleases([withExtra])).toEqual([withExtra])
  })

  it('rejects an assessment that is not technically ready', async () => {
    const release = await makeRelease()
    const bad = roundTrip({
      ...release,
      assessment: { ...release.assessment, status: 'review-required' },
    })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects an assessment bound to a different packet', async () => {
    const release = await makeRelease()
    const bad = roundTrip({ ...release, assessment: readyAssessment('f'.repeat(64)) })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('keeps a later duplicate id or duplicate revision as unreadable and the rest readable', async () => {
    const one = await makeRelease()
    const sameId = await makeRelease({ revision: 2, packetSha256: 'b'.repeat(64) })
    const sameRevision = await makeRelease({
      id: 'rel-3',
      revision: 1,
      packetSha256: 'c'.repeat(64),
    })
    const fine = await makeRelease({ id: 'rel-4', revision: 4, packetSha256: 'd'.repeat(64) })
    const parsed = parseReleases(roundTrip([one, { ...sameId, id: 'rel-1' }, sameRevision, fine]))
    expect(parsed.map((entry) => ('unreadable' in entry ? 'unreadable' : entry.id))).toEqual([
      'rel-1',
      'unreadable',
      'unreadable',
      'rel-4',
    ])
  })
})

describe('releasesForFile', () => {
  it('writes an unreadable entry back as its raw value so reloading never nests it', async () => {
    const good = await makeRelease()
    const raw = { id: 'x' }
    const entries = parseReleases([roundTrip(good), raw])
    const written = releasesForFile(entries)
    expect(written[1]).toBe(raw)
    expect(parseReleases(roundTrip(written))).toEqual(entries)
  })
})

describe('verifyReleases', () => {
  it('reports ok, corrupted and unreadable per entry, in order', async () => {
    const ok = await makeRelease()
    const corrupted = await makeRelease({
      id: 'rel-2',
      revision: 2,
      packetSha256: 'b'.repeat(64),
      source: '{"changed":true}',
      sourceSha256: ok.sourceSha256,
    })
    const unreadable: UnreadableRelease = { unreadable: true, raw: 1 }
    expect(await verifyReleases([ok, corrupted, unreadable])).toEqual([
      'ok',
      'corrupted',
      'unreadable',
    ])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/releases.test.ts`
Expected: FAIL — `Failed to resolve import "./releases"`.

- [ ] **Step 3: Implement**

Create `src/scene/releases.ts`:

```ts
import type { ProductionReleaseRecord } from '../ui/productionReleaseGate'

export const MAX_RELEASE_SOURCE_BYTES = 16 * 1024 * 1024
export const MAX_RELEASED_BY_LENGTH = 100
export const MAX_RELEASES = 25 // each entry holds a whole scene; the file must not grow without bound

const HEX64 = /^[a-f0-9]{64}$/

export interface ProductionRelease {
  id: string
  revision: number // file-local; identify a release across files by packetSha256
  releasedBy: string
  identity: 'self-declared'
  releasedAt: string
  packetSha256: string
  sourceSha256: string
  assessment: ProductionReleaseRecord
  // The exact text the packet manifest's sourceSha256 covers. A string, never an object: saving
  // rounds floats to 6 dp, which would change the hash.
  source: string
}

export interface UnreadableRelease {
  unreadable: true
  raw: unknown
}

export type ReleaseEntry = ProductionRelease | UnreadableRelease
export type ReleaseIntegrity = 'ok' | 'corrupted' | 'unreadable'

export const isReadable = (entry: ReleaseEntry): entry is ProductionRelease =>
  (entry as UnreadableRelease).unreadable !== true

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readRelease(value: unknown): ProductionRelease | null {
  if (!isRecord(value)) return null
  const { id, revision, releasedBy, identity, releasedAt, packetSha256, sourceSha256, source } =
    value
  if (typeof id !== 'string' || id === '') return null
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null
  if (
    typeof releasedBy !== 'string' ||
    releasedBy.trim() === '' ||
    releasedBy.length > MAX_RELEASED_BY_LENGTH
  )
    return null
  if (identity !== 'self-declared') return null
  if (typeof releasedAt !== 'string' || !Number.isFinite(Date.parse(releasedAt))) return null
  if (typeof packetSha256 !== 'string' || !HEX64.test(packetSha256)) return null
  if (typeof sourceSha256 !== 'string' || !HEX64.test(sourceSha256)) return null
  if (typeof source !== 'string') return null
  const assessment = value.assessment
  if (
    !isRecord(assessment) ||
    assessment.schemaVersion !== 1 ||
    assessment.kind !== 'production-release-assessment' ||
    assessment.status !== 'technically-ready' ||
    assessment.packetSha256 !== packetSha256 ||
    assessment.formalApproval !== 'not-recorded' ||
    !Array.isArray(assessment.findings) ||
    !Array.isArray(assessment.limitations) ||
    !isRecord(assessment.revision) ||
    (assessment.revision.mode !== 'initial' && assessment.revision.mode !== 'revision')
  )
    return null
  // Chars never exceed bytes, so this never rejects a source the recorder accepted. JSON validity
  // is not checked: a matching sourceSha256 (verifyReleases) is what ties it to what was captured.
  if (source.length > MAX_RELEASE_SOURCE_BYTES) return null
  // Spread first so a field a newer build added survives a save-as-copy; the validated fields win.
  return {
    ...(value as object),
    id,
    revision,
    releasedBy,
    identity,
    releasedAt,
    packetSha256,
    sourceSha256,
    assessment: assessment as unknown as ProductionReleaseRecord,
    source,
  }
}

// Structure only: hashing is async, so parseFile stays synchronous and verifyReleases runs after load.
// A damaged or duplicate entry is kept as unreadable rather than failing the whole file.
export function parseReleases(value: unknown): ReleaseEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [{ unreadable: true, raw: value }]
  const ids = new Set<string>()
  const revisions = new Set<number>()
  return value.map((raw): ReleaseEntry => {
    const release = readRelease(raw)
    if (!release || ids.has(release.id) || revisions.has(release.revision))
      return { unreadable: true, raw }
    ids.add(release.id)
    revisions.add(release.revision)
    return release
  })
}

export function releasesForFile(entries: readonly ReleaseEntry[]): unknown[] {
  return entries.map((entry) => (isReadable(entry) ? entry : entry.raw))
}

// Detects accidental corruption only: the digest is stored beside the data it covers in an
// editable file, so it is not evidence against deliberate edits.
export function verifyReleases(entries: readonly ReleaseEntry[]): Promise<ReleaseIntegrity[]> {
  return Promise.all(
    entries.map(async (entry): Promise<ReleaseIntegrity> => {
      if (!isReadable(entry)) return 'unreadable'
      return (await sha256Hex(entry.source)) === entry.sourceSha256 ? 'ok' : 'corrupted'
    }),
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/scene/releases.test.ts`
Expected: PASS (all tests in the three `describe` blocks).

- [ ] **Step 5: Mutation-test the parser and verifier**

Back up: `cp src/scene/releases.ts "$SCRATCHPAD"/releases.bak` (use the scratchpad path from your environment notes).
For each mutation apply, `grep` the change, run `pnpm vitest run src/scene/releases.test.ts`, expect the named failure, restore with `cp`, grep again:
1. `assessment.packetSha256 !== packetSha256` -> `false` : expect only "bound to a different packet" fails.
2. delete `|| ids.has(release.id) || revisions.has(release.revision)` : expect the duplicate-id/revision test fails.
3. `=== entry.sourceSha256 ? 'ok' : 'corrupted'` -> `? 'ok' : 'ok'` : expect the verify test fails.
4. `identity !== 'self-declared'` -> `false` : expect the "verified identity claim" case fails.

- [ ] **Step 6: Full check, then commit**

Run `pnpm typecheck && pnpm lint && pnpm test` first.

```bash
git add src/scene/releases.ts src/scene/releases.test.ts src/scene/__fixtures__/release.ts
git commit -m "Add release record types, structural parsing and integrity check

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 2: `recordRelease` rules

**Files:**
- Modify: `src/scene/releases.ts`
- Test: `src/scene/releases.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the imports of `src/scene/releases.test.ts`: `MAX_RELEASES`, `recordRelease`, `type RecordReleaseInput` (and `SOURCE_A` from the fixture; `MAX_RELEASE_SOURCE_BYTES` is already imported from Task 1). Append:

```ts
const SOURCE_B = SOURCE_A.replace('Kitchen', 'Laundry')

async function inputFor(
  source: string,
  overrides: Partial<RecordReleaseInput> = {},
): Promise<RecordReleaseInput> {
  return {
    assessment: readyAssessment('b'.repeat(64)),
    packetSourceSha256: await sha256Hex(source),
    liveSource: source,
    releasedBy: '  Sam  ',
    releasedAt: new Date('2026-10-14T02:00:00Z'),
    id: 'new-id',
    ...overrides,
  }
}

describe('recordRelease', () => {
  it('appends revision 1 with a trimmed name, the exact source and its hash', async () => {
    const result = await recordRelease([], await inputFor(SOURCE_A))
    if (!result.ok) throw new Error(result.reason)
    expect(result.releases).toEqual([result.release])
    expect(result.release).toEqual({
      id: 'new-id',
      revision: 1,
      releasedBy: 'Sam',
      identity: 'self-declared',
      releasedAt: '2026-10-14T02:00:00.000Z',
      packetSha256: 'b'.repeat(64),
      sourceSha256: await sha256Hex(SOURCE_A),
      assessment: readyAssessment('b'.repeat(64)),
      source: SOURCE_A,
    })
  })

  it('numbers the next revision after the highest existing one, gaps included', async () => {
    const existing = [
      await makeRelease({ id: 'r4', revision: 4, source: SOURCE_B, packetSha256: 'c'.repeat(64) }),
      await makeRelease({ id: 'r2', revision: 2, source: SOURCE_B, packetSha256: 'd'.repeat(64) }),
    ]
    const before = structuredClone(existing)
    const result = await recordRelease(existing, await inputFor(SOURCE_A))
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.revision).toBe(5)
    expect(result.releases.slice(0, 2)).toEqual(before)
    expect(existing).toEqual(before)
  })

  it.each(['blocked', 'review-required'] as const)('refuses a %s assessment', async (status) => {
    const input = await inputFor(SOURCE_A)
    input.assessment = { ...input.assessment, status }
    expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'not-ready' })
  })

  it('refuses a manifest digest that is not 64 hex characters', async () => {
    expect(await recordRelease([], await inputFor(SOURCE_A, { packetSourceSha256: 'abc' }))).toEqual(
      { ok: false, reason: 'invalid-manifest-hash' },
    )
  })

  it('refuses when the live source no longer hashes to the packet manifest', async () => {
    const input = await inputFor(SOURCE_A, { liveSource: SOURCE_B })
    expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'source-mismatch' })
  })

  it('accepts an upper-case manifest digest', async () => {
    const hash = (await sha256Hex(SOURCE_A)).toUpperCase()
    const result = await recordRelease([], await inputFor(SOURCE_A, { packetSourceSha256: hash }))
    expect(result.ok).toBe(true)
  })

  it.each([
    ['empty', '   '],
    ['over 100 characters', 'x'.repeat(101)],
  ])('refuses a name that is %s', async (_label, releasedBy) => {
    expect(await recordRelease([], await inputFor(SOURCE_A, { releasedBy }))).toEqual({
      ok: false,
      reason: 'invalid-name',
    })
  })

  it('accepts a name of exactly 100 characters', async () => {
    const result = await recordRelease([], await inputFor(SOURCE_A, { releasedBy: 'x'.repeat(100) }))
    expect(result.ok).toBe(true)
  })

  it('refuses a source over the size cap before hashing it', async () => {
    const big = 'x'.repeat(MAX_RELEASE_SOURCE_BYTES + 1)
    expect(
      await recordRelease([], await inputFor(big, { packetSourceSha256: 'a'.repeat(64) })),
    ).toEqual({ ok: false, reason: 'source-too-large' })
  })

  it('refuses a packet that is already recorded, even when it is not the newest release', async () => {
    const existing = [
      await makeRelease({ id: 'r1', revision: 1, packetSha256: 'b'.repeat(64), source: SOURCE_B }),
      await makeRelease({ id: 'r2', revision: 2, packetSha256: 'e'.repeat(64), source: SOURCE_B }),
    ]
    expect(await recordRelease(existing, await inputFor(SOURCE_A))).toEqual({
      ok: false,
      reason: 'duplicate-packet',
    })
  })

  it('refuses a source identical to the newest release', async () => {
    const existing = [await makeRelease({ id: 'r1', revision: 1, source: SOURCE_A })]
    expect(await recordRelease(existing, await inputFor(SOURCE_A))).toEqual({
      ok: false,
      reason: 'unchanged',
    })
  })

  it('allows A -> B -> A: only the newest release is compared', async () => {
    const existing = [
      await makeRelease({ id: 'r1', revision: 1, source: SOURCE_A, packetSha256: 'c'.repeat(64) }),
      await makeRelease({ id: 'r2', revision: 2, source: SOURCE_B, packetSha256: 'd'.repeat(64) }),
    ]
    const result = await recordRelease(existing, await inputFor(SOURCE_A))
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.revision).toBe(3)
  })

  it('refuses a new release once the file already holds the maximum', async () => {
    const existing = Array.from({ length: MAX_RELEASES }, () => ({
      unreadable: true as const,
      raw: null,
    }))
    expect(await recordRelease(existing, await inputFor(SOURCE_A))).toEqual({
      ok: false,
      reason: 'release-limit',
    })
  })

  it('ignores unreadable entries when numbering and comparing', async () => {
    const existing = [{ unreadable: true as const, raw: { revision: 99 } }]
    const result = await recordRelease(existing, await inputFor(SOURCE_A))
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.revision).toBe(1)
    expect(result.releases).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/releases.test.ts`
Expected: FAIL — `recordRelease` is not exported.

- [ ] **Step 3: Implement**

Append to `src/scene/releases.ts`:

```ts
export type RecordRefusal =
  | 'not-ready'
  | 'invalid-manifest-hash'
  | 'source-mismatch'
  | 'invalid-name'
  | 'duplicate-packet'
  | 'unchanged'
  | 'source-too-large'
  | 'release-limit'
  | 'stale' // returned by useFile when the list changed while a record was in flight

export interface RecordReleaseInput {
  assessment: ProductionReleaseRecord
  packetSourceSha256: string // sourceSha256 from the verified packet manifest
  liveSource: string // captureProductionSource(...) of the live project
  releasedBy: string
  releasedAt?: Date
  id?: string
}

export type RecordReleaseResult =
  | { ok: true; releases: ReleaseEntry[]; release: ProductionRelease }
  | { ok: false; reason: RecordRefusal }

const refuse = (reason: RecordRefusal): RecordReleaseResult => ({ ok: false, reason })

export async function recordRelease(
  existing: readonly ReleaseEntry[],
  input: RecordReleaseInput,
): Promise<RecordReleaseResult> {
  const { assessment } = input
  if (assessment.status !== 'technically-ready') return refuse('not-ready')
  const packetSource = input.packetSourceSha256.toLowerCase()
  if (!HEX64.test(packetSource)) return refuse('invalid-manifest-hash')
  const releasedBy = input.releasedBy.trim()
  if (releasedBy === '' || releasedBy.length > MAX_RELEASED_BY_LENGTH) return refuse('invalid-name')
  if (new TextEncoder().encode(input.liveSource).length > MAX_RELEASE_SOURCE_BYTES)
    return refuse('source-too-large')
  const sourceSha256 = await sha256Hex(input.liveSource)
  if (sourceSha256 !== packetSource) return refuse('source-mismatch')
  const readable = existing.filter(isReadable)
  if (existing.length >= MAX_RELEASES) return refuse('release-limit')
  if (readable.some((release) => release.packetSha256 === assessment.packetSha256))
    return refuse('duplicate-packet')
  const newest = readable.reduce<ProductionRelease | undefined>(
    (best, release) => (best === undefined || release.revision > best.revision ? release : best),
    undefined,
  )
  if (newest?.sourceSha256 === sourceSha256) return refuse('unchanged')
  const release: ProductionRelease = {
    id: input.id ?? crypto.randomUUID(),
    revision: (newest?.revision ?? 0) + 1,
    releasedBy,
    identity: 'self-declared',
    releasedAt: new Date(input.releasedAt ?? new Date()).toISOString(),
    packetSha256: assessment.packetSha256,
    sourceSha256,
    assessment,
    source: input.liveSource,
  }
  return { ok: true, releases: [...existing, release], release }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/scene/releases.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-test each refusal rule**

Back up `releases.ts` first. One mutation at a time, predict, run, restore, grep:
1. `assessment.status !== 'technically-ready'` -> `false` : the two `not-ready` cases fail.
2. `sourceSha256 !== packetSource` -> `false` : mismatch test fails.
3. `.toLowerCase()` removed from `packetSource` : upper-case test fails.
4. `> MAX_RELEASED_BY_LENGTH` -> `>= MAX_RELEASED_BY_LENGTH` : the exactly-100 test fails.
5. `release.packetSha256 === assessment.packetSha256` -> `false` : duplicate-packet test fails.
6. `newest?.sourceSha256 === sourceSha256` -> `readable.some((r) => r.sourceSha256 === sourceSha256)` : the A -> B -> A test fails (and only it).
7. `(newest?.revision ?? 0) + 1` -> `readable.length + 1` : the gaps test fails.
8. `existing.length >= MAX_RELEASES` -> `readable.length >= MAX_RELEASES` : the release-limit test fails (its entries are all unreadable).

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/scene/releases.ts src/scene/releases.test.ts
git commit -m "Add recordRelease refusal rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 3: Packet source capture and manifest-hash reader

**Files:**
- Modify: `src/ui/buildProductionPacket.ts` (the `structuredClone` at the top of `buildProductionPacket`, plus one new export)
- Modify: `src/ui/productionReleaseGate.ts` (new export `packetSourceSha256`)
- Test: `src/ui/buildProductionPacket.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/ui/buildProductionPacket.test.ts` change the import line `import { buildProductionPacket, productionPacketFilename } from './buildProductionPacket'` to also import `captureProductionSource`, add `import { packetSourceSha256 } from './productionReleaseGate'`, and add inside the top-level `describe('production handoff packet', ...)` block:

```ts
  it('captures the exact text the manifest sourceSha256 covers', async () => {
    const input = {
      scene: machiningProject(),
      projectName: 'Source',
      capturedAt,
      materialLibrary: {},
      hardwareLibrary: { x: { unitCost: 1.5 } },
    }
    const source = captureProductionSource(input)
    const files = unzipSync(await buildProductionPacket(input))
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(await hash(strToU8(source))).toBe(manifest.sourceSha256)
    expect(Object.keys(JSON.parse(source))).toEqual([
      'scene',
      'projectName',
      'hardwareLibrary',
      'materialLibrary',
    ])
  })

  it('reads the manifest source digest only from a verified packet', async () => {
    const input = {
      scene: machiningProject(),
      projectName: 'Digest',
      capturedAt,
      materialLibrary: {},
      hardwareLibrary: {},
    }
    const packet = await buildProductionPacket(input)
    expect(await packetSourceSha256(packet)).toBe(await hash(strToU8(captureProductionSource(input))))
    expect(await packetSourceSha256(new Uint8Array([1, 2, 3]))).toBeNull()
  })
```

If `hardwareLibrary: { x: { unitCost: 1.5 } }` fails typecheck, look at `HardwareLibraryEntry` in `src/scene/types.ts` and use a valid entry; the point is a non-empty library so key order matters.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildProductionPacket.test.ts -t "source"`
Expected: FAIL — `captureProductionSource` / `packetSourceSha256` are not exported.

- [ ] **Step 3: Implement**

In `src/ui/buildProductionPacket.ts` replace the capture inside `buildProductionPacket`:

```ts
export async function buildProductionPacket(input: ProductionPacketInput): Promise<Uint8Array> {
  // This copy happens before the first await, including both pricing libraries outside the scene.
  const captured = structuredClone({
    scene: input.scene,
    projectName: input.projectName,
    hardwareLibrary: input.hardwareLibrary,
    materialLibrary: input.materialLibrary,
  })
```

with:

```ts
const captureInput = (input: ProductionPacketInput) =>
  structuredClone({
    scene: input.scene,
    projectName: input.projectName,
    hardwareLibrary: input.hardwareLibrary,
    materialLibrary: input.materialLibrary,
  })

// The text whose SHA-256 is the manifest's sourceSha256. A release stores it verbatim.
export function captureProductionSource(input: ProductionPacketInput): string {
  return JSON.stringify(captureInput(input))
}

export async function buildProductionPacket(input: ProductionPacketInput): Promise<Uint8Array> {
  // This copy happens before the first await, including both pricing libraries outside the scene.
  const captured = captureInput(input)
```

Leave `const source = strToU8(JSON.stringify(captured))` as is.

In `src/ui/productionReleaseGate.ts` add after the `list` helper:

```ts
// The digest the packet claims for its source. Read only from a packet that passed integrity
// inspection, because inspectProductionPacket exposes files for passed packets alone.
export async function packetSourceSha256(packet: Uint8Array): Promise<string | null> {
  const { files } = await inspectProductionPacket(packet)
  if (!files?.['manifest.json']) return null
  try {
    const value = obj(JSON.parse(strFromU8(files['manifest.json']))).sourceSha256
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/ui/buildProductionPacket.test.ts src/ui/productionReleaseGate.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Mutation-test**

Back up `buildProductionPacket.ts`. Mutate `captureProductionSource` to `JSON.stringify(input)`: the key-order assertion fails. Mutate `captureInput` to reorder keys (put `projectName` first): the hash assertion fails. Restore and grep after each.

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/ui/buildProductionPacket.ts src/ui/buildProductionPacket.test.ts src/ui/productionReleaseGate.ts
git commit -m "Expose the packet source capture and manifest source digest

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 4: File format v28 and parsing `releases`

**Files:**
- Modify: `src/scene/types.ts` (`ZimmuFile`), `src/scene/useFile.ts` (`FILE_FORMAT_VERSION`, imports, the return of `parseFile`)
- Test: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing tests and update the version pins**

In `src/scene/useFile.test.ts`:
- line ~178 `expect(JSON.parse(text).version).toBe(27)` -> `.toBe(FILE_FORMAT_VERSION)`.
- the `it.each([24, 25])` test (~line 257): rename the title `suggests a v27 copy` -> `suggests a v28 copy`, change `name: 'kitchen-v27.zimmu'` and the `suggestedName` expectation to `'kitchen-v28.zimmu'`.
- the pin test (~line 2289) -> `expect(FILE_FORMAT_VERSION).toBe(28)`.

Add imports at the top: `import { makeRelease } from './__fixtures__/release'` and `import { sha256Hex, verifyReleases } from './releases'`.

Add a new `describe` block at the end of the file:

```ts
describe('parseFile releases', () => {
  const envelope = (releases?: unknown): string =>
    JSON.stringify({
      ...FIXTURE,
      version: FILE_FORMAT_VERSION,
      project: defaultProject(FIXTURE.scene, 'current'),
      ...(releases === undefined ? {} : { releases }),
    })

  it('parses a file without releases and does not invent the field', () => {
    expect('releases' in parseFile(envelope())).toBe(false)
  })

  it('keeps recorded releases', async () => {
    const release = await makeRelease()
    expect(parseFile(envelope([release])).releases).toEqual([release])
  })

  it('opens a file whose release entry is damaged and keeps the entry as unreadable', async () => {
    const good = await makeRelease()
    const parsed = parseFile(envelope([good, { id: 'broken' }]))
    expect(parsed.releases).toEqual([good, { unreadable: true, raw: { id: 'broken' } }])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/useFile.test.ts -t "releases|version|v28"`
Expected: FAIL — version is still 27, `releases` is not a `ZimmuFile` field (typecheck) and is not parsed into entries.

- [ ] **Step 3: Implement**

`src/scene/types.ts`: add `import type { ReleaseEntry } from './releases'` with the other imports, and in `ZimmuFile` after `project?`:

```ts
  releases?: ReleaseEntry[] // absent in v27 and earlier, and when none were recorded
```

`src/scene/useFile.ts`:
- `export const FILE_FORMAT_VERSION = 28`
- add `import { parseReleases } from './releases'`
- change the end of `parseFile` from

```ts
  return validateCurrentFile({
    ...raw,
    scene: repaired,
    project: raw.project === undefined ? defaultProject(repaired, text) : raw.project,
  })
```

to

```ts
  const { releases: rawReleases, ...envelope } = raw
  return validateCurrentFile({
    ...envelope,
    scene: repaired,
    project: raw.project === undefined ? defaultProject(repaired, text) : raw.project,
    ...(rawReleases === undefined ? {} : { releases: parseReleases(rawReleases as unknown) }),
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/scene/useFile.test.ts src/scene/fileValidation.test.ts && pnpm typecheck`
Expected: PASS, no type errors. If another test file hard-codes `27` for the format version, `grep -rn "FILE_FORMAT_VERSION\|version).toBe(27\|v27" src e2e --include=*.ts --include=*.tsx | grep -v node_modules` and update only assertions about the *current* version.

- [ ] **Step 5: Mutation-test**

Back up `useFile.ts`. Drop the `...(rawReleases ...)` spread: the keeps-releases test fails. Replace `parseReleases(rawReleases as unknown)` with `rawReleases`: the damaged-entry test fails. Restore and grep.

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/scene/types.ts src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "Bump file format to v28 and parse recorded releases

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 5: `useFile` state, recording, saving and loading

**Files:**
- Modify: `src/scene/useFile.ts`
- Test: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing tests**

Add imports to `useFile.test.ts`: `readyAssessment`, `SOURCE_A` from `./__fixtures__/release`. Add inside the existing top-level `describe('useFile', ...)` block, before its closing brace:

```ts
  describe('recorded releases', () => {
    const recordInput = async (packet: string) => ({
      assessment: readyAssessment(packet.repeat(64)),
      packetSourceSha256: await sha256Hex(SOURCE_A),
      liveSource: SOURCE_A,
      releasedBy: 'Sam',
    })
    const saveTarget = () => {
      const write = vi.fn().mockResolvedValue(undefined)
      const handle = {
        name: 'rel.zimmu',
        createWritable: vi
          .fn()
          .mockResolvedValue({ write, close: vi.fn().mockResolvedValue(undefined) }),
      }
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(handle))
      return write
    }
    const storedFile = (extra: Record<string, unknown>, version = FILE_FORMAT_VERSION) =>
      ({
        name: 'stored.zimmu',
        queryPermission: vi.fn().mockResolvedValue('granted'),
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              ...FIXTURE,
              version,
              project: defaultProject(FIXTURE.scene, 'current'),
              ...extra,
            }),
          ),
        }),
        createWritable: vi.fn(),
      }) as unknown as FileSystemFileHandle

    it('records a release, marks the project dirty, saves it and clears dirty', async () => {
      const write = saveTarget()
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      await act(async () => { await result.current.saveFile() })
      expect(result.current.isDirty).toBe(false)
      let outcome: Awaited<ReturnType<typeof result.current.recordRelease>> | undefined
      await act(async () => { outcome = await result.current.recordRelease(await recordInput('c')) })
      expect(outcome).toMatchObject({ ok: true })
      expect(result.current.releases).toHaveLength(1)
      expect(result.current.isDirty).toBe(true)
      await waitFor(() => expect(result.current.releaseIntegrity).toEqual(['ok']))
      await act(async () => { await result.current.saveFile() })
      expect(result.current.isDirty).toBe(false)
      const written = JSON.parse(write.mock.calls[1][0] as string)
      expect(written.version).toBe(FILE_FORMAT_VERSION)
      expect(parseFile(write.mock.calls[1][0] as string).releases).toEqual(result.current.releases)
    })

    it('saves the source byte-for-byte although the serializer rounds numbers to 6 dp', async () => {
      const write = saveTarget()
      const source = JSON.stringify({ scene: { x: 0.1234567891, y: 1 / 3 } })
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      await act(async () => {
        await result.current.recordRelease({
          assessment: readyAssessment('c'.repeat(64)),
          packetSourceSha256: await sha256Hex(source),
          liveSource: source,
          releasedBy: 'Sam',
        })
      })
      await act(async () => { await result.current.saveFile() })
      const text = write.mock.calls[0][0] as string
      expect(JSON.parse(text).releases[0].source).toBe(source)
      expect(await verifyReleases(parseFile(text).releases!)).toEqual(['ok'])
    })

    it('does not mark a release recorded during the write as saved', async () => {
      let finishWrite!: () => void
      const write = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { finishWrite = resolve }),
      )
      const handle = {
        name: 'slow.zimmu',
        createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn().mockResolvedValue(undefined) }),
      }
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(handle))
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      const input = await recordInput('c')
      let saving!: Promise<void>
      act(() => { saving = result.current.saveFile() })
      await waitFor(() => expect(write).toHaveBeenCalled())
      await act(async () => { await result.current.recordRelease(input) })
      await act(async () => { finishWrite(); await saving })
      expect(JSON.parse(write.mock.calls[0][0] as string).releases).toBeUndefined()
      expect(result.current.isDirty).toBe(true)
    })

    it('writes no releases key when none were recorded', async () => {
      const write = saveTarget()
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      await act(async () => { await result.current.saveFile() })
      expect('releases' in JSON.parse(write.mock.calls[0][0] as string)).toBe(false)
    })

    it('restores releases from a stored file without marking it dirty, and verifies them', async () => {
      const release = await makeRelease()
      vi.mocked(idb.readHandle).mockResolvedValue(storedFile({ releases: [release] }))
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      expect(result.current.releases).toEqual([release])
      expect(result.current.isDirty).toBe(false)
      await waitFor(() => expect(result.current.releaseIntegrity).toEqual(['ok']))
    })

    it('reports a stored source that no longer matches its hash as corrupted', async () => {
      const release = await makeRelease()
      vi.mocked(idb.readHandle).mockResolvedValue(
        storedFile({ releases: [{ ...release, source: '{"edited":true}' }] }),
      )
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.releaseIntegrity).toEqual(['corrupted']))
    })

    it('writes an unreadable entry back unchanged, so reloading does not nest it', async () => {
      vi.mocked(idb.readHandle).mockResolvedValue(storedFile({ releases: [{ id: 'broken' }] }))
      const write = vi.fn().mockResolvedValue(undefined)
      const next = {
        name: 'copy.zimmu',
        isSameEntry: vi.fn().mockResolvedValue(false),
        createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn().mockResolvedValue(undefined) }),
      }
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(next))
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      expect(result.current.releases).toEqual([{ unreadable: true, raw: { id: 'broken' } }])
      await act(async () => { await result.current.saveAsFile() })
      expect(JSON.parse(write.mock.calls[0][0] as string).releases).toEqual([{ id: 'broken' }])
    })

    it('a second record that started from the same list is stale, not a duplicate revision', async () => {
      saveTarget()
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      const inputC = await recordInput('c')
      const inputD = await recordInput('d')
      let first: unknown
      let second: unknown
      await act(async () => {
        // Both start from the same empty list before either commits.
        const a = result.current.recordRelease(inputC)
        const b = result.current.recordRelease(inputD)
        ;[first, second] = await Promise.all([a, b])
      })
      expect(first).toMatchObject({ ok: true })
      expect(second).toEqual({ ok: false, reason: 'stale' })
      expect(result.current.releases).toHaveLength(1)
    })

    it('keeps the releases array identity across a scene change', async () => {
      const release = await makeRelease()
      vi.mocked(idb.readHandle).mockResolvedValue(storedFile({ releases: [release] }))
      const { result, rerender } = renderHook((props) => useFile(props), {
        initialProps: makeInput(),
      })
      await waitFor(() => expect(result.current.releases).toHaveLength(1))
      const before = result.current.releases
      rerender(makeInput({ scene: { ...makeInput().scene, hardware: [] } }))
      expect(result.current.releases).toBe(before)
      expect(result.current.isDirty).toBe(false)
    })

    it('opens a file newer than the app as save-as-copy only', async () => {
      const oldHandle = storedFile({}, 99)
      vi.mocked(idb.readHandle).mockResolvedValue(oldHandle)
      const write = vi.fn().mockResolvedValue(undefined)
      const next = {
        name: 'copy.zimmu',
        isSameEntry: vi.fn().mockResolvedValue(false),
        createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn().mockResolvedValue(undefined) }),
      }
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(next))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.fileReady).toBe(true))
      expect(result.current.isDirty).toBe(true)
      await act(async () => { await result.current.saveFile() })
      expect(window.showSaveFilePicker).toHaveBeenCalled()
      expect(oldHandle.createWritable).not.toHaveBeenCalled()
    })

    it('clears releases on a new file', async () => {
      const release = await makeRelease()
      vi.mocked(idb.readHandle).mockResolvedValue(storedFile({ releases: [release] }))
      const { result } = renderHook(() => useFile(makeInput()))
      await waitFor(() => expect(result.current.releases).toHaveLength(1))
      await act(async () => { await result.current.newFile() })
      expect(result.current.releases).toEqual([])
      expect(result.current.isDirty).toBe(false)
    })
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/useFile.test.ts -t "recorded releases"`
Expected: FAIL — `releases`, `releaseIntegrity` and `recordRelease` do not exist on the hook result.

- [ ] **Step 3: Implement in `src/scene/useFile.ts`**

1. Imports:

```ts
import {
  recordRelease as recordReleaseEntry,
  releasesForFile,
  verifyReleases,
  type RecordReleaseInput,
  type RecordReleaseResult,
  type ReleaseEntry,
  type ReleaseIntegrity,
} from './releases'
```
(extend the existing `import { parseReleases } from './releases'` line instead of adding a second import from the same module.)

2. `UseFileResult` gains:

```ts
  releases: ReleaseEntry[]
  releaseIntegrity: ReleaseIntegrity[] | null // null while the hashes are being checked
  recordRelease: (input: RecordReleaseInput) => Promise<RecordReleaseResult>
```

3. State and refs, next to the other `useState`/`useRef` declarations:

```ts
  const [releases, setReleases] = useState<ReleaseEntry[]>([])
  const [verified, setVerified] = useState<{
    releases: ReleaseEntry[]
    result: ReleaseIntegrity[]
  } | null>(null)
  const releasesRef = useRef<ReleaseEntry[]>(releases)
  const lastSavedReleasesRef = useRef<ReleaseEntry[]>(releases)
  // Loading replaces the list; it is also the saved baseline, so a freshly opened file is clean.
  // A plain inner function, exactly like the existing resetProjectHistory, which the same empty-deps
  // effect and useCallbacks already call without a suppression. If `pnpm lint` still reports a
  // missing dependency, wrap it in useCallback with [] (it touches only refs and a state setter).
  const applyReleases = (next: ReleaseEntry[]) => {
    releasesRef.current = next
    lastSavedReleasesRef.current = next
    setReleases(next)
  }
```

and, after the dirty-tracking effect:

```ts
  useEffect(() => {
    if (releases.length === 0) return
    let live = true
    void verifyReleases(releases).then((result) => {
      if (live) setVerified({ releases, result })
    })
    return () => {
      live = false
    }
  }, [releases])
  const releaseIntegrity =
    releases.length === 0 ? [] : verified?.releases === releases ? verified.result : null
```

4. Dirty effect: add one line to the `const dirty = ...` expression:

```ts
      releasesRef.current !== lastSavedReleasesRef.current ||
```
(compare by reference; never `JSON.stringify` the releases).

5. `buildEnvelope`: after `project: reconcileProject(...)` add

```ts
      ...(releasesRef.current.length > 0 ? { releases: releasesForFile(releasesRef.current) as ReleaseEntry[] } : {}),
```

6. In `saveAsFile` and `saveFile`, snapshot the list at the moment the envelope is serialised, and record **that** as the saved baseline. Directly before `const content = serialize(buildEnvelope())` add `const savedReleases = releasesRef.current`. After the writes succeed, where `lastSavedProjectRef.current = JSON.stringify(projectRef.current)` is set, add:

```ts
      lastSavedReleasesRef.current = savedReleases
```

and replace the following `isDirtyRef.current = false` / `setIsDirty(false)` pair with

```ts
      const stillDirty = releasesRef.current !== savedReleases
      isDirtyRef.current = stillDirty
      setIsDirty(stillDirty)
```

A release recorded while the file was being written is in `releasesRef` but not in the bytes on disk; copying `releasesRef.current` after the awaits would mark it saved and lose it silently.

7. In the startup effect and `openFile`, after `projectNameRef.current = envelope.name` add `applyReleases(envelope.releases ?? [])`, and change `pendingMigrationRef.current = envelope.version < FILE_FORMAT_VERSION` to `envelope.version !== FILE_FORMAT_VERSION` in both places (a newer file may carry fields this build would drop, so it is only ever saved as a copy). In `newFile`, add `applyReleases([])` next to `pendingMigrationRef.current = false`.

8. The recorder, near `setProjectName`:

```ts
  const recordRelease = useCallback(async (input: RecordReleaseInput): Promise<RecordReleaseResult> => {
    const base = releasesRef.current
    const result = await recordReleaseEntry(base, input)
    if (!result.ok) return result
    if (releasesRef.current !== base) return { ok: false, reason: 'stale' }
    releasesRef.current = result.releases
    setReleases(result.releases)
    isDirtyRef.current = true
    setIsDirty(true)
    return result
  }, [])
```

9. Add `releases`, `releaseIntegrity`, `recordRelease` to the hook's returned object (the block that currently ends with `project,` near line 733).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/scene/useFile.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. The pre-existing "version > FILE_FORMAT_VERSION: warns and parses successfully" test must still pass.

- [ ] **Step 5: Mutation-test**

Back up `useFile.ts`. Predict, run `pnpm vitest run src/scene/useFile.test.ts -t "recorded releases"`, restore, grep:
1. delete `if (releasesRef.current !== base) return ...stale...` : the stale test fails (both calls succeed).
2. delete the `releasesRef.current !== lastSavedReleasesRef.current ||` clause: the "dirty then save" test fails at the `isDirty` true assertion, and nothing else.
3. in `buildEnvelope` replace `releasesForFile(releasesRef.current)` with `releasesRef.current`: the unreadable write-back test fails.
4. change `envelope.version !== FILE_FORMAT_VERSION` back to `<` in `openFile`/startup: the newer-than-app test fails.
5. drop `lastSavedReleasesRef.current = savedReleases` from `saveFile`: the first test fails at `isDirty false` after the second save.
6. replace `savedReleases` with `releasesRef.current` in the baseline write (the pre-fix behaviour): the mid-write test fails at `isDirty` true.
7. in `buildEnvelope`, wrap the source in `JSON.parse(source)` before saving (a source that round-trips as an object): the byte-for-byte test fails.

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "Carry recorded releases through useFile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 6: Release list component

**Files:**
- Create: `src/ui/ReleaseList.tsx`, `src/ui/ReleaseList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ReleaseList } from './ReleaseList'
import { makeRelease } from '../scene/__fixtures__/release'

afterEach(cleanup)

it('renders nothing when no release is recorded', () => {
  const { container } = render(<ReleaseList releases={[]} integrity={[]} />)
  expect(container.textContent).toBe('')
})

it('lists newest first, labels the name self-declared and marks older releases superseded', async () => {
  const one = await makeRelease({ id: 'r1', revision: 1 })
  const two = await makeRelease({ id: 'r2', revision: 2, packetSha256: 'b'.repeat(64) })
  render(<ReleaseList releases={[one, two]} integrity={['ok', 'ok']} />)
  const rows = within(screen.getByRole('region', { name: 'Recorded releases' })).getAllByRole(
    'listitem',
  )
  expect(rows[0].textContent).toContain('Revision 2')
  expect(rows[0].textContent).toContain('Latest recorded')
  expect(rows[1].textContent).toContain('Revision 1')
  expect(rows[1].textContent).toContain('Superseded')
  expect(rows[0].textContent).toContain('Sam Designer (self-declared, unverified)')
  expect(rows[0].textContent).toContain('bbbbbbbbbbbb')
  expect(screen.getByText(/accidental corruption only/)).toBeTruthy()
})

it('shows each integrity state, including still checking', async () => {
  const one = await makeRelease({ id: 'r1', revision: 1 })
  const two = await makeRelease({ id: 'r2', revision: 2, packetSha256: 'b'.repeat(64) })
  const { rerender } = render(
    <ReleaseList releases={[one, { unreadable: true, raw: {} }, two]} integrity={null} />,
  )
  // An unreadable row is known to be unreadable without waiting for any hash.
  expect(screen.getAllByText('Checking integrity…')).toHaveLength(2)
  expect(screen.getByText(/Unreadable entry, preserved/)).toBeTruthy()
  rerender(
    <ReleaseList
      releases={[one, { unreadable: true, raw: {} }, two]}
      integrity={['ok', 'unreadable', 'corrupted']}
    />,
  )
  expect(screen.getByText('Integrity check passed')).toBeTruthy()
  expect(screen.getByText(/Integrity check failed/)).toBeTruthy()
  expect(screen.getByText(/Unreadable entry, preserved/)).toBeTruthy()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/ReleaseList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { isReadable, type ReleaseEntry, type ReleaseIntegrity } from '../scene/releases'

const INTEGRITY_TEXT: Record<ReleaseIntegrity, string> = {
  ok: 'Integrity check passed',
  corrupted: 'Integrity check failed: the stored snapshot differs from its recorded hash',
  unreadable: 'Unreadable entry, preserved in the file as read',
}

export function ReleaseList({
  releases,
  integrity,
}: {
  releases: readonly ReleaseEntry[]
  integrity: readonly ReleaseIntegrity[] | null
}) {
  if (releases.length === 0) return null
  const newest = Math.max(0, ...releases.filter(isReadable).map((release) => release.revision))
  const rows = releases
    .map((entry, index) => ({ entry, status: integrity?.[index] }))
    .reverse()
  return (
    <section aria-label="Recorded releases" className="my-4 rounded border p-3">
      <h3 className="font-semibold">Recorded releases</h3>
      <p className="text-sm">
        Recorded in this project file. A record is not formal approval, and the releasing name is
        typed by the user and unverified. The integrity check detects accidental corruption only.
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map(({ entry, status }, position) => (
          <li key={isReadable(entry) ? entry.id : `unreadable-${position}`} className="border-t pt-2">
            {isReadable(entry) ? (
              <>
                <p className="font-medium">
                  Revision {entry.revision} ·{' '}
                  {entry.revision === newest ? 'Latest recorded' : 'Superseded'}
                </p>
                <p>
                  {entry.releasedBy} (self-declared, unverified) · {entry.releasedAt}
                </p>
                <p className="break-all">Packet {entry.packetSha256.slice(0, 12)}</p>
                <p>Snapshot {Math.max(1, Math.round(entry.source.length / 1024))} KiB</p>
              </>
            ) : null}
            <p>
              {isReadable(entry)
                ? status === undefined
                  ? 'Checking integrity…'
                  : INTEGRITY_TEXT[status]
                : INTEGRITY_TEXT.unreadable}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/ui/ReleaseList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Mutation-test**

Back up the component. Change `entry.revision === newest` to `true`: the superseded assertion fails. Remove `.reverse()`: the order assertion fails. Restore and grep.

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/ui/ReleaseList.tsx src/ui/ReleaseList.test.tsx
git commit -m "Add the recorded releases list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 7: Gate recording UI, verifier pass-through and App wiring

**Files:**
- Modify: `src/ui/ProductionReleaseGate.tsx`, `src/ui/ProductionPacketVerifier.tsx`, `src/App.tsx`
- Create: `src/ui/ProductionReleaseGateRecording.test.tsx`
- Modify: `src/ui/ProductionPacketVerifier.test.tsx`

- [ ] **Step 1: Write the failing gate tests**

Create `src/ui/ProductionReleaseGateRecording.test.tsx`:

```tsx
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionReleaseGate, type ReleaseRecording } from './ProductionReleaseGate'
import * as release from './productionReleaseGate'
import { sha256Hex } from '../scene/releases'
import { readyAssessment, SOURCE_A } from '../scene/__fixtures__/release'

let hash: string
beforeAll(async () => {
  hash = await sha256Hex(SOURCE_A)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const assessed = (status: release.ProductionReleaseRecord['status'] = 'technically-ready') => ({
  ...readyAssessment('b'.repeat(64)),
  status,
})
function setup(options: {
  status?: release.ProductionReleaseRecord['status']
  live?: string
  manifest?: string | null
  outcome?: Awaited<ReturnType<ReleaseRecording['onRecord']>>
}) {
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(assessed(options.status))
  vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(
    options.manifest === undefined ? hash : options.manifest,
  )
  const onRecord = vi
    .fn<ReleaseRecording['onRecord']>()
    .mockResolvedValue(
      options.outcome ?? { ok: true, releases: [], release: { revision: 1 } as never },
    )
  const recording: ReleaseRecording = {
    captureSource: () => options.live ?? SOURCE_A,
    onRecord,
  }
  render(<ProductionReleaseGate packet={new Uint8Array([1])} recording={recording} />)
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  return onRecord
}

it.each(['blocked', 'review-required'] as const)(
  'offers no recording for a %s assessment',
  async (status) => {
    setup({ status })
    await screen.findByText(/Release blocked|Release review required/)
    expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
    expect(screen.queryByLabelText('Released by')).toBeNull()
  },
)

it('offers recording for a ready assessment whose live source matches, and needs a name', async () => {
  const onRecord = setup({})
  const button = await screen.findByRole('button', { name: 'Record release' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Released by'), { target: { value: 'Sam' } })
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await screen.findByText('Recorded as revision 1.')
  expect(onRecord).toHaveBeenCalledWith({
    assessment: assessed(),
    packetSourceSha256: hash,
    liveSource: SOURCE_A,
    releasedBy: 'Sam',
  })
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('says the model changed, and offers no button, when the live source differs from the packet', async () => {
  setup({ live: SOURCE_A.replace('Kitchen', 'Laundry') })
  await screen.findByText(/The model changed since this packet was exported/)
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('explains a packet without a usable source digest', async () => {
  setup({ manifest: null })
  await screen.findByText(/does not carry a valid source digest/)
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('shows the refusal text when recording is refused', async () => {
  setup({ outcome: { ok: false, reason: 'unchanged' } })
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await screen.findByText('Nothing has changed since the latest recorded release.')
  expect(screen.queryByRole('button', { name: 'Record release' })).not.toBeNull()
})

it('drops the recording controls when the release context changes', async () => {
  setup({})
  await screen.findByRole('button', { name: 'Record release' })
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'revision' } })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull())
})
```

The gate's `ReleaseRecording` has no `releases`/`integrity` fields: the list lives in the verifier (see step 3), so the gate only needs the source capture and the recorder.

Add to `src/ui/ProductionPacketVerifier.test.tsx` (inside its `describe`):

```tsx
  it('lists recorded releases before any packet is chosen', async () => {
    const { makeRelease } = await import('../scene/__fixtures__/release')
    const recorded = await makeRelease()
    render(
      <ProductionPacketVerifier
        onClose={() => {}}
        recording={{
          captureSource: () => '',
          onRecord: async () => ({ ok: false, reason: 'stale' }),
          releases: [recorded],
          integrity: ['ok'],
        }}
      />,
    )
    expect(screen.getByRole('region', { name: 'Recorded releases' })).toBeTruthy()
    expect(screen.getByText('Integrity check passed')).toBeTruthy()
  })
```
and adjust the type usage so `recording` there is `VerifierRecording` (defined below as `ReleaseRecording & { releases; integrity }`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/ProductionReleaseGateRecording.test.tsx src/ui/ProductionPacketVerifier.test.tsx`
Expected: FAIL — `ReleaseRecording` export / `recording` prop do not exist.

- [ ] **Step 3: Implement**

`src/ui/ProductionReleaseGate.tsx`:

1. Imports (extend existing lines):

```tsx
import {
  assessProductionRelease,
  packetSourceSha256,
  type ProductionReleaseRecord,
} from './productionReleaseGate'
import {
  sha256Hex,
  type RecordRefusal,
  type RecordReleaseInput,
  type RecordReleaseResult,
} from '../scene/releases'
```

2. Above the component:

```tsx
export interface ReleaseRecording {
  captureSource: () => string
  onRecord: (input: RecordReleaseInput) => Promise<RecordReleaseResult>
}

type Recordable = 'match' | 'mismatch' | 'no-digest' | null

const REFUSAL_TEXT: Record<RecordRefusal, string> = {
  'not-ready': 'Only a technically ready packet can be recorded as a release.',
  'invalid-manifest-hash': 'This packet does not carry a valid source digest.',
  'invalid-packet-hash': 'The release assessment carries no valid packet digest.',
  'source-mismatch':
    'The model changed since this packet was exported. Re-export the packet, then verify it again.',
  'invalid-name': 'Enter who is releasing this (1 to 100 characters).',
  'duplicate-packet': 'This packet is already recorded as a release.',
  unchanged: 'Nothing has changed since the latest recorded release.',
  'source-too-large': 'The project is too large to record (limit 16 MiB).',
  'release-limit': 'This file already holds the maximum of 25 recorded releases.',
  stale: 'The release list changed. Try again.',
}
```

3. Signature `export function ProductionReleaseGate({ packet, recording }: { packet: Uint8Array; recording?: ReleaseRecording })`.

4. State, after `const [error, setError] = ...`:

```tsx
  const [recordable, setRecordable] = useState<Recordable>(null)
  const [packetSource, setPacketSource] = useState<string | null>(null)
  const [releasedBy, setReleasedBy] = useState('')
  const [recordMessage, setRecordMessage] = useState('')
  const [recorded, setRecorded] = useState(false)
  const [recordBusy, setRecordBusy] = useState(false)
```

5. `reset` also clears them:

```tsx
  const reset = () => {
    setRecord(null)
    setError('')
    setRecordable(null)
    setPacketSource(null)
    setRecordMessage('')
    setRecorded(false)
  }
```

6. In `assess`, replace `if (alive.current) setRecord(result)` with:

```tsx
      let state: Recordable = null
      let digest: string | null = null
      if (recording && result.status === 'technically-ready') {
        digest = await packetSourceSha256(packet)
        state =
          digest === null
            ? 'no-digest'
            : digest === (await sha256Hex(recording.captureSource()))
              ? 'match'
              : 'mismatch'
      }
      if (alive.current) {
        setRecord(result)
        setPacketSource(digest)
        setRecordable(state)
      }
```

7. Handler, after `downloadOutput`:

```tsx
  const recordThisRelease = async () => {
    if (!recording || !record || packetSource === null) return
    setRecordBusy(true)
    setRecordMessage('')
    try {
      const outcome = await recording.onRecord({
        assessment: record,
        packetSourceSha256: packetSource,
        liveSource: recording.captureSource(),
        releasedBy,
      })
      if (!alive.current) return
      if (outcome.ok) {
        setRecorded(true)
        setRecordMessage(`Recorded as revision ${outcome.release.revision}.`)
      } else setRecordMessage(REFUSAL_TEXT[outcome.reason])
    } catch (error) {
      if (alive.current)
        setRecordMessage(error instanceof Error ? error.message : 'The release could not be recorded.')
    } finally {
      if (alive.current) setRecordBusy(false)
    }
  }
```

8. JSX, directly after the `Download release record` `<Button>` and before `<ul>`:

```tsx
            {recordable === 'mismatch' && <p role="alert">{REFUSAL_TEXT['source-mismatch']}</p>}
            {recordable === 'no-digest' && (
              <p role="alert">{REFUSAL_TEXT['invalid-manifest-hash']}</p>
            )}
            {recordable === 'match' && !recorded && (
              <div className="my-3">
                <label className="block">
                  Released by{' '}
                  <input
                    value={releasedBy}
                    maxLength={100}
                    disabled={recordBusy}
                    onChange={(event) => setReleasedBy(event.target.value)}
                  />
                </label>
                <p className="text-sm">
                  Recording stores a frozen copy of this project in the file. The name is typed,
                  not verified, and this is not formal approval.
                </p>
                <Button
                  disabled={recordBusy || releasedBy.trim() === ''}
                  onClick={() => void recordThisRelease()}
                >
                  Record release
                </Button>
              </div>
            )}
            {recordMessage && <p role="status">{recordMessage}</p>}
```

`src/ui/ProductionPacketVerifier.tsx`: add imports `ReleaseList` and `type ReleaseRecording`, `type ReleaseEntry, type ReleaseIntegrity`; export

```tsx
export interface VerifierRecording extends ReleaseRecording {
  releases: readonly ReleaseEntry[]
  integrity: readonly ReleaseIntegrity[] | null
}
```

Change the signature to `({ onClose, recording }: { onClose: () => void; recording?: VerifierRecording })`; render `{recording && <ReleaseList releases={recording.releases} integrity={recording.integrity} />}` after the opening explanatory `<p>` and before the file label; and pass `recording` to the gate: `{packet && <ProductionReleaseGate packet={packet} recording={recording} />}` (the extra `releases`/`integrity` props are structurally allowed).

`src/App.tsx`:
- add `captureProductionSource` import: `import { captureProductionSource } from './ui/buildProductionPacket'`.
- add `releases, releaseIntegrity, recordRelease,` to the `useFile` destructure.
- replace the verifier element with:

```tsx
      {packetVerificationOpen && (
        <ProductionPacketVerifier
          onClose={() => setPacketVerificationOpen(false)}
          recording={{
            captureSource: () =>
              captureProductionSource({
                scene,
                projectName,
                hardwareLibrary,
                materialLibrary: library,
              }),
            onRecord: recordRelease,
            releases,
            integrity: releaseIntegrity,
          }}
        />
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/ui/ProductionReleaseGateRecording.test.tsx src/ui/ProductionReleaseGate.test.tsx src/ui/ProductionPacketVerifier.test.tsx src/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS. (If `src/App.test.tsx` does not exist, run `pnpm vitest run src/App` instead.)

- [ ] **Step 5: Mutation-test the gate**

Back up `ProductionReleaseGate.tsx`. Predict, run the recording test file, restore, grep:
1. `result.status === 'technically-ready'` -> `true` in `assess`: a blocked or review-required result would now get `recordable === 'match'` and show the button, so both `it.each` cases fail.
2. `digest === (await sha256Hex(...)) ? 'match' : 'mismatch'` -> always `'match'`: the mismatch test fails.
3. remove `releasedBy.trim() === ''` from `disabled`: the "needs a name" assertion fails.
4. drop `setRecorded(true)`: the "button gone after success" assertion fails.
5. remove `setRecordable(null)` from `reset`: the context-change test fails.

- [ ] **Step 6: Commit**

Run `pnpm typecheck && pnpm lint && pnpm test` and confirm all pass before committing.

```bash
git add src/ui src/App.tsx
git commit -m "Record a technically ready release from the gate dialog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
```

---

### Task 8: Browser workflow, docs, full verification, push

**Files:**
- Modify: `e2e/production-packet-integrity.spec.ts`, `CLAUDE.md`, `docs/superpowers/plans/2026-09-29-design-to-manufacturing-architecture.md`, `docs/superpowers/notes/2026-10-14-persisted-release-record-notes.md`, `project-structure.html` (regenerated)

- [ ] **Step 1: Extend the existing e2e**

In `e2e/production-packet-integrity.spec.ts`, immediately after the line `expect(release.revision.mode).toBe('initial')` insert:

```ts
  // A packet exported from the unchanged model offers recording exactly when it is technically
  // ready; otherwise recording is not offered at all.
  await expect(
    gate.getByRole('heading', {
      name: /Release blocked|Release review required|Technically ready for release/,
    }),
  ).toBeVisible()
  const ready = await gate.getByRole('heading', { name: 'Technically ready for release' }).isVisible()
  if (ready) {
    await gate.getByLabel('Released by').fill('E2E Designer')
    await gate.getByRole('button', { name: 'Record release' }).click()
    await expect(gate.getByText('Recorded as revision 1.')).toBeVisible()
    const recorded = dialog.getByRole('region', { name: 'Recorded releases' })
    await expect(recorded.getByText('E2E Designer (self-declared, unverified)')).toBeVisible()
    await expect(recorded.getByText('Integrity check passed')).toBeVisible()
  } else {
    await expect(gate.getByRole('button', { name: 'Record release' })).toHaveCount(0)
  }
```

Run: `pnpm exec playwright test e2e/production-packet-integrity.spec.ts --project=chromium` (check `playwright.config.ts` for the project name first; use whatever it defines).
Expected: PASS. Note in the notes file which branch ran (ready or not).

- [ ] **Step 2: Docs**

`CLAUDE.md`:
1. Architecture tree, after the `edgeBanding.ts` entry in `scene/`, add:

```
│   ├── releases.ts      Recorded production releases: ProductionRelease, parseReleases (structure only,
│   │                    damaged entries kept as unreadable), verifyReleases (async SHA-256), recordRelease
│   │                    (the refusal rules). Stored in ZimmuFile.releases, outside Scene and project history
```
2. In the Key Invariants `ZimmuFile` bullet: change `FILE_FORMAT_VERSION = 26` to `= 28` and append to its parenthesis `; v27 added the shared manufacturing part record (see docs/superpowers/specs/2026-10-03-manufacturing-record-design.md); v28 added recorded production releases`.
3. Add these bullets at the end of Key Invariants:

```
- **A recorded release lives outside `Scene` and `ProjectStructure`.** `ZimmuFile.releases` holds entries that each carry the exact captured source text; putting them in `Scene` would make a snapshot contain itself, and putting them in the project would let project undo delete a release. `useFile` compares the array by reference for dirty tracking and never `JSON.stringify`s it.
- **A release stores `source` as a string, and the saved scene is not comparable to it.** Saving rounds floats to 6 dp, which would change `sourceSha256`. The string is the authority; reproduction (a later slice) must load from it.
- **`parseFile` stays synchronous, so release hashes are checked after load.** `parseReleases` validates structure only; `verifyReleases` re-hashes asynchronously. A damaged or duplicate entry is kept as `{ unreadable: true, raw }` and written back as `raw`, so one bad entry neither blocks opening nor nests on re-save. The hash check detects accidental corruption only: digests sit beside the data in an editable file.
- **Revision numbers are file-local, and a file newer than the app saves only as a copy.** Two copies of a file can each record revision N+1; identify a release across files by `packetSha256`. `pendingMigrationRef` is set for any `version !== FILE_FORMAT_VERSION` so a build never silently drops fields it does not know.
```

`docs/superpowers/plans/2026-09-29-design-to-manufacturing-architecture.md`, Stage 6 item 2: append the sentence `Slice 1 (2026-10-14, plans/2026-10-14-persisted-release-record.md): a technically-ready release is recorded in the file with a frozen source snapshot and a self-declared releaser; registration, acknowledgement, supersession-on-acknowledgement, withdrawal and open-snapshot-as-copy remain.`

Notes file: record that the gate inspects the packet a third time for the manifest digest (accepted: it runs once per deliberate assess click, and reusing the earlier inspection would change `assessProductionRelease`'s API), that unreadable raw entries pass through the 6 dp number replacer on save (hence the UI says "preserved as read", not "unchanged"), and that a save-as-copy of a newer file keeps unknown fields on release entries but not on parts of the file this build does not know. Append an entry per CLAUDE.md with the e2e result (ready or not-ready branch), the final test counts, any mutation that surprised you, and that `releasesForFile` writes a non-array `releases` value back as a one-element array on first save (stable thereafter).

- [ ] **Step 3: Regenerate the structure page**

Run: `node scripts/update-structure-html.mjs`
Expected: `project-structure.html` changes only inside `AUTOGEN` markers (check with `git diff --stat project-structure.html`).

- [ ] **Step 4: Full verification**

Run each and read the output:

```bash
pnpm typecheck; echo "typecheck=$?"
pnpm lint; echo "lint=$?"
pnpm test; echo "test=$?"
pnpm build; echo "build=$?"
pnpm build:catalogue; echo "catalogue=$?"
```
Expected: all `=0`. Test count must be at least the baseline (175 files / 2,998 passed / 10 skipped) plus the new tests. Do not pipe through `tail` (it hides the exit status).

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "Document recorded releases and cover the browser workflow

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TnU5R2t1NM2Cdaj4BsNtZh"
git push -u origin claude/gracious-johnson-vuxgyj
```
Do not open a pull request unless asked.

---

## Self-review

**Spec coverage**
- Data model, `id`/file-local `revision`, unique id/revision, string `source`, 16 MiB cap -> Tasks 1, 2 (`readRelease`, `recordRelease`).
- Recording rules 1-5 incl. A -> B -> A, empty list, invalid manifest hash -> Task 2 tests; gate reads the hash only from a verified packet -> Task 3.
- Integrity on load: sync structural parse, async `verifyReleases`, corrupted vs unreadable, raw write-back, accidental-corruption wording -> Tasks 1, 5, 6.
- `source` authoritative over the rounded scene -> Task 4 float test + CLAUDE.md invariant (Task 8).
- Older-build loss mitigated by save-as-copy for newer files -> Task 5 (test and `!==`).
- Dirty tracking by reference, not stringify -> Task 5.
- UI: Released-by field, Record button only when ready and matched, mismatch message, list with unverified label -> Tasks 6, 7.
- Docs: v27 and v28 history, tree entry, invariants, Stage 6 note, notes file, structure page -> Task 8.
- Out of scope (registration, withdrawal, open-as-copy, verified identity) -> not planned, stated in the Stage 6 note.

**Placeholder scan:** no TBD/TODO; each code step carries code. Two instructions depend on the repo at execution time and say how to resolve them: the `HardwareLibraryEntry` shape in Task 3 and the e2e project name in Task 8.

**Type consistency:** `ProductionRelease`, `UnreadableRelease`, `ReleaseEntry`, `ReleaseIntegrity`, `RecordReleaseInput`, `RecordReleaseResult`, `RecordRefusal` (incl. `'stale'`), `ReleaseRecording { captureSource, onRecord }`, `VerifierRecording extends ReleaseRecording { releases, integrity }`, `useFile` returning `releases`, `releaseIntegrity`, `recordRelease` — names match across Tasks 1-7. `releasesForFile` returns `unknown[]` and is cast to `ReleaseEntry[]` only at the envelope boundary in Task 5.

**Known risks to watch while executing**
- `pnpm lint` (react-hooks 7) may object to the `setVerified` call; it is inside an async callback, which is allowed, and `releaseIntegrity` is derived during render rather than set in an effect for that reason.
- A real Base 600 packet may not be `technically-ready`; the e2e handles both outcomes and the notes record which ran.
- `useFile.test.ts` is very large; add the new `describe` inside the existing top-level block so its `beforeEach` mocks apply.
