import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { comparisonFixture } from './__fixtures__/packetRevisionComparison'
import {
  defaultRevisionReviewView,
  readRevisionReviewView,
  saveRevisionReviewView,
} from './revisionReviewViewPreferences'
const key = 'zimmu:revision-review-views:v1'
beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())
it('binds explicit view fields to the ordered archive hashes and drops review content', () => {
  const report = comparisonFixture(),
    defaults = defaultRevisionReviewView(report)
  const view = {
    ...defaults,
    search: 'Board',
    pendingOnly: true,
    coverageSearch: { outputs: 'note query', limitations: 'scope query' },
    coveragePendingFirst: { outputs: true, limitations: false },
  }
  saveRevisionReviewView(report, {
    ...view,
    notes: 'Private note',
    reviewer: 'Reviewer',
    changes: [true],
  } as typeof view)
  expect(readRevisionReviewView(report)).toEqual(view)
  const raw = localStorage.getItem(key)!
  expect(raw).not.toContain('Private note')
  expect(raw).not.toContain('Reviewer')
  expect(raw).not.toContain('"changes"')
  const reversed = { ...report, before: report.after, after: report.before }
  expect(readRevisionReviewView(reversed)).toEqual(defaultRevisionReviewView(reversed))
  const other = { ...report, after: { ...report.after, sha256: 'c'.repeat(64) } }
  expect(readRevisionReviewView(other)).toEqual(defaultRevisionReviewView(other))
})
it('bounds retention to ten recently saved pairs and updates without duplicates', () => {
  const report = comparisonFixture()
  for (let i = 1; i <= 11; i++) {
    const next = { ...report, after: { ...report.after, sha256: i.toString(16).padStart(64, '0') } }
    saveRevisionReviewView(next, { ...defaultRevisionReviewView(next), search: String(i) })
  }
  const first = { ...report, after: { ...report.after, sha256: '1'.padStart(64, '0') } }
  expect(readRevisionReviewView(first).search).toBe('')
  const latest = { ...report, after: { ...report.after, sha256: 'b'.padStart(64, '0') } }
  expect(readRevisionReviewView(latest).search).toBe('11')
  saveRevisionReviewView(latest, { ...defaultRevisionReviewView(latest), search: 'updated' })
  expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(10)
  expect(readRevisionReviewView(latest).search).toBe('updated')
})
it('falls back for corrupt, unsupported, oversized and invalid preferences and stale references', () => {
  const report = comparisonFixture(),
    defaults = defaultRevisionReviewView(report)
  for (const raw of [
    '{',
    JSON.stringify({ schemaVersion: 2, entries: [] }),
    ' '.repeat(512 * 1024 + 1),
  ]) {
    localStorage.setItem(key, raw)
    expect(readRevisionReviewView(report)).toEqual(defaults)
  }
  const identity = `${report.before.sha256}:${report.after.sha256}`
  for (const patch of [
    { pendingOnly: 'true' },
    { classification: 'other' },
    { search: 'x'.repeat(4097) },
    { coverageSearch: null },
    { coveragePendingFirst: { outputs: 1, limitations: false } },
  ]) {
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ pair: identity, view: { ...defaults, ...patch } }],
      }),
    )
    expect(readRevisionReviewView(report)).toEqual(defaults)
  }
  saveRevisionReviewView(report, {
    ...defaults,
    selected: 'missing',
    partFilter: 'missing',
    search: 'retained',
  })
  expect(readRevisionReviewView(report)).toEqual({ ...defaults, search: 'retained' })
  const invalid = { ...report, before: { ...report.before, sha256: null } }
  const beforeInvalid = localStorage.getItem(key)
  saveRevisionReviewView(invalid, { ...defaults, search: 'invalid pair' })
  expect(localStorage.getItem(key)).toBe(beforeInvalid)
  expect(readRevisionReviewView(invalid).search).toBe('')
})
it('handles denied reads and writes without breaking the review and replaces corrupt data on save', () => {
  const report = comparisonFixture(),
    defaults = defaultRevisionReviewView(report)
  localStorage.setItem(key, '{')
  saveRevisionReviewView(report, { ...defaults, search: 'repaired' })
  expect(readRevisionReviewView(report).search).toBe('repaired')
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('quota')
    },
  })
  expect(readRevisionReviewView(report)).toEqual(defaults)
  expect(() => saveRevisionReviewView(report, defaults)).not.toThrow()
})

it('rejects every invalid preference field and oversized or unsupported envelopes', () => {
  const report = comparisonFixture(),
    defaults = defaultRevisionReviewView(report)
  const entry = {
    pair: `${report.before.sha256}:${report.after.sha256}`,
    view: { ...defaults, search: 'must not restore' },
  }
  const envelope = JSON.stringify({ schemaVersion: 1, entries: [entry] })
  for (const raw of [
    JSON.stringify({ schemaVersion: 2, entries: [entry] }),
    ' '.repeat(512 * 1024) + envelope,
    JSON.stringify({ schemaVersion: 1, entries: Array(11).fill(entry) }),
  ]) {
    localStorage.setItem(key, raw)
    expect(readRevisionReviewView(report)).toEqual(defaults)
  }
  for (const patch of [
    { selected: 1 },
    { search: 1 },
    { partSearch: 1 },
    { partFilter: 1 },
    { pendingOnly: 1 },
    { pendingPartsFirst: 1 },
    { classification: 'other' },
    { coverageSearch: { outputs: 1, limitations: '' } },
    { coverageSearch: { outputs: '', limitations: 1 } },
    { coveragePendingFirst: { outputs: 1, limitations: false } },
    { coveragePendingFirst: { outputs: false, limitations: 1 } },
  ]) {
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ ...entry, view: { ...entry.view, ...patch } }],
      }),
    )
    expect(readRevisionReviewView(report)).toEqual(defaults)
  }
})
