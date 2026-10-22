import { describe, expect, it } from 'vitest'
import {
  MAX_RELEASE_SOURCE_BYTES,
  MAX_RELEASES,
  parseReleases,
  recordRelease,
  releasesForFile,
  sha256Hex,
  verifyReleases,
  type RecordReleaseInput,
  type UnreadableRelease,
} from './releases'
import {
  makeRelease,
  readyAssessment,
  reviewAssessment,
  reviewFinding,
  SOURCE_A,
} from './__fixtures__/release'

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

  it('rejects a blocked assessment', async () => {
    const release = await makeRelease()
    const bad = roundTrip({ ...release, assessment: { ...release.assessment, status: 'blocked' } })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('reads a ready release written before acknowledgedReviewItems existed', async () => {
    const release = await makeRelease()
    expect(release).not.toHaveProperty('acknowledgedReviewItems')
    expect(parseReleases(roundTrip([release]))).toEqual([release])
  })

  it('reads a review-required release whose acknowledged count matches its open items', async () => {
    const release = await makeRelease({
      assessment: reviewAssessment('a'.repeat(64), 3),
      acknowledgedReviewItems: 3,
    })
    expect(parseReleases(roundTrip([release]))).toEqual([release])
  })

  it.each([
    ['no acknowledged count', undefined],
    ['a count below its open items', 2],
    ['a count above its open items', 4],
    ['a fractional count', 2.5],
    ['a string count', '3'],
  ])('rejects a review-required release with %s', async (_label, acknowledgedReviewItems) => {
    const bad = roundTrip({
      ...(await makeRelease({ assessment: reviewAssessment('a'.repeat(64), 3) })),
      acknowledgedReviewItems,
    })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects a review-required release with no review items, even acknowledging none', async () => {
    const bad = roundTrip(
      await makeRelease({
        assessment: reviewAssessment('a'.repeat(64), 0),
        acknowledgedReviewItems: 0,
      }),
    )
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects a review-required release carrying a blocker, even with a matching count', async () => {
    const assessment = reviewAssessment('a'.repeat(64), 1)
    assessment.findings.push({ ...reviewFinding('broken'), category: 'blocker' })
    const bad = roundTrip(await makeRelease({ assessment, acknowledgedReviewItems: 1 }))
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects a finding whose category is unknown or missing', async () => {
    for (const category of ['advisory', undefined]) {
      const assessment = reviewAssessment('a'.repeat(64), 1)
      const bad = roundTrip(
        await makeRelease({
          assessment: {
            ...assessment,
            findings: [...assessment.findings, { ...reviewFinding('x'), category } as never],
          },
          acknowledgedReviewItems: 1,
        }),
      )
      expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
    }
  })

  it('rejects a ready release that lists findings or acknowledges any', async () => {
    const release = await makeRelease()
    const withFinding = roundTrip({
      ...release,
      assessment: { ...release.assessment, findings: [reviewFinding('x')] },
    })
    const withCount = roundTrip({ ...release, acknowledgedReviewItems: 1 })
    expect(parseReleases([withFinding])[0]).toMatchObject({ unreadable: true })
    expect(parseReleases([withCount])[0]).toMatchObject({ unreadable: true })
    expect(
      parseReleases([roundTrip({ ...release, acknowledgedReviewItems: 0 })])[0],
    ).not.toHaveProperty('unreadable')
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

describe('parseReleases hardening', () => {
  it.each([[42], [null], [[]]])(
    'keeps the non-record entry %j as unreadable with its raw value',
    (raw) => {
      expect(parseReleases([raw])).toEqual([{ unreadable: true, raw }])
    },
  )

  it('keeps an otherwise valid entry carrying an unreadable key whole, and writes it back intact', async () => {
    const bad = { ...(await makeRelease()), unreadable: true }
    const parsed = parseReleases([bad])
    expect(parsed).toEqual([{ unreadable: true, raw: bad }])
    expect(releasesForFile(parsed)[0]).toBe(bad)
  })

  it('writes a good entry back as the same object', async () => {
    const good = await makeRelease()
    const parsed = parseReleases(roundTrip([good]))
    expect(releasesForFile(parsed)[0]).toBe(parsed[0])
  })

  it.each([
    ['a wrong schemaVersion', { schemaVersion: 2 }],
    ['a wrong kind', { kind: 'other' }],
    ['a null finding', { findings: [null] }],
    ['a numeric finding', { findings: [42] }],
    ['a non-string limitation', { limitations: [7] }],
    ['a bad assessedAt', { assessedAt: 'yesterday' }],
    ['a missing assessedAt', { assessedAt: undefined }],
    ['a numeric assessedAt', { assessedAt: 2020 }],
    [
      'a non-hex beforeSha256',
      { revision: { mode: 'initial', beforeSha256: 'zz', reviewSha256: null } },
    ],
    [
      'a non-string reviewSha256',
      { revision: { mode: 'initial', beforeSha256: null, reviewSha256: 5 } },
    ],
  ])('rejects an assessment with %s', async (_label, patch) => {
    const release = await makeRelease()
    const bad = roundTrip({ ...release, assessment: { ...release.assessment, ...patch } })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('rejects a null assessment', async () => {
    const bad = roundTrip({ ...(await makeRelease()), assessment: null })
    expect(parseReleases([bad])[0]).toMatchObject({ unreadable: true })
  })

  it('accepts hex digests in the revision block', async () => {
    const release = await makeRelease()
    const ok = roundTrip({
      ...release,
      assessment: {
        ...release.assessment,
        revision: { mode: 'revision', beforeSha256: 'a'.repeat(64), reviewSha256: 'b'.repeat(64) },
      },
    })
    expect(parseReleases([ok])[0]).not.toHaveProperty('unreadable')
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
      acknowledgedReviewItems: 0,
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

  it('refuses a blocked assessment, acknowledged or not', async () => {
    for (const acknowledgeReview of [false, true]) {
      const input = await inputFor(SOURCE_A, { acknowledgeReview })
      input.assessment = { ...input.assessment, status: 'blocked' }
      expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'not-ready' })
    }
  })

  it.each(['technically-ready', 'review-required'] as const)(
    'refuses a %s assessment that carries a blocker finding',
    async (status) => {
      const input = await inputFor(SOURCE_A, { acknowledgeReview: true })
      input.assessment = {
        ...reviewAssessment('b'.repeat(64), 1),
        status,
        findings: [{ ...reviewFinding('broken'), category: 'blocker' }],
      }
      expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'not-ready' })
    },
  )

  it.each([
    ['a ready assessment listing a finding', 'technically-ready', [reviewFinding('x')]],
    ['a review-required assessment with nothing to review', 'review-required', []],
    [
      'a finding of unknown category',
      'review-required',
      [reviewFinding('y'), { ...reviewFinding('x'), category: 'advisory' }],
    ],
  ] as const)('refuses %s, as parse would', async (_label, status, findings) => {
    const input = await inputFor(SOURCE_A, { acknowledgeReview: true })
    input.assessment = {
      ...readyAssessment('b'.repeat(64)),
      status,
      findings: findings as never,
    }
    expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'not-ready' })
  })

  it('refuses a contradictory assessment before checking any digest', async () => {
    const input = await inputFor(SOURCE_A, { acknowledgeReview: true, packetSourceSha256: 'abc' })
    input.assessment = { ...readyAssessment('b'.repeat(64)), findings: [reviewFinding('x')] }
    expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'not-ready' })
  })

  it.each([undefined, false])(
    'refuses a review-required assessment when acknowledgeReview is %s',
    async (acknowledgeReview) => {
      const input = await inputFor(SOURCE_A, {
        assessment: reviewAssessment('b'.repeat(64)),
        acknowledgeReview,
      })
      expect(await recordRelease([], input)).toEqual({
        ok: false,
        reason: 'review-not-acknowledged',
      })
    },
  )

  it('asks for acknowledgment before checking any digest', async () => {
    const input = await inputFor(SOURCE_A, {
      assessment: reviewAssessment('b'.repeat(64)),
      packetSourceSha256: 'abc',
    })
    expect(await recordRelease([], input)).toEqual({
      ok: false,
      reason: 'review-not-acknowledged',
    })
  })

  it('records an acknowledged review-required assessment with the count of its open items', async () => {
    const assessment = reviewAssessment('b'.repeat(64), 3)
    const result = await recordRelease(
      [],
      await inputFor(SOURCE_A, { assessment, acknowledgeReview: true }),
    )
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.acknowledgedReviewItems).toBe(3)
    expect(result.release.assessment).toEqual(assessment)
    expect(parseReleases(roundTrip(result.releases))).toEqual(result.releases)
  })

  it('records a ready assessment with nothing acknowledged, even when acknowledgeReview is set', async () => {
    const result = await recordRelease([], await inputFor(SOURCE_A, { acknowledgeReview: true }))
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.acknowledgedReviewItems).toBe(0)
  })

  it('refuses a manifest digest that is not 64 hex characters', async () => {
    expect(
      await recordRelease([], await inputFor(SOURCE_A, { packetSourceSha256: 'abc' })),
    ).toEqual({ ok: false, reason: 'invalid-manifest-hash' })
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
    const result = await recordRelease(
      [],
      await inputFor(SOURCE_A, { releasedBy: 'x'.repeat(100) }),
    )
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

  it.each([
    ['upper-case', 'B'.repeat(64)],
    ['short', 'abc'],
  ])('refuses an assessment whose packet digest is %s', async (_label, packetSha256) => {
    const input = await inputFor(SOURCE_A)
    input.assessment = { ...input.assessment, packetSha256 }
    expect(await recordRelease([], input)).toEqual({ ok: false, reason: 'invalid-packet-hash' })
  })

  it('takes the newest release by highest revision, not by array position', async () => {
    const existing = [
      await makeRelease({ id: 'r4', revision: 4, source: SOURCE_A, packetSha256: 'c'.repeat(64) }),
      await makeRelease({ id: 'r2', revision: 2, source: SOURCE_B, packetSha256: 'd'.repeat(64) }),
    ]
    expect(await recordRelease(existing, await inputFor(SOURCE_A))).toEqual({
      ok: false,
      reason: 'unchanged',
    })
  })

  it('records the last release that fits under the limit', async () => {
    const existing = Array.from({ length: MAX_RELEASES - 1 }, () => ({
      unreadable: true as const,
      raw: null,
    }))
    const result = await recordRelease(existing, await inputFor(SOURCE_A))
    if (!result.ok) throw new Error(result.reason)
    expect(result.release.revision).toBe(1)
    expect(result.releases).toHaveLength(MAX_RELEASES)
  })
})
