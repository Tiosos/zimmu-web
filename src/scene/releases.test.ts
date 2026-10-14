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
