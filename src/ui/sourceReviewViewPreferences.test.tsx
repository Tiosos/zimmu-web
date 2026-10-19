import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import {
  defaultSourceReviewView,
  readSourceReviewView,
  saveSourceReviewView,
  SOURCE_REVIEW_VIEWS_KEY,
} from './sourceReviewViewPreferences'
import { useSourceReviewView } from './useSourceReviewView'
const key = (n = 0) =>
  JSON.stringify(['release', 1, 'a'.repeat(64), 'b'.repeat(64), n.toString(16).padStart(64, '0')])
beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
it('restores only the exact release and ordered source hashes without storing review content', () => {
  const view = {
    search: 'Panel café',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  }
  expect(saveSourceReviewView(key(), view)).toBe(true)
  expect(readSourceReviewView(key())).toEqual({ view, failed: false })
  const identity = JSON.parse(key())
  for (let i = 0; i < 5; i++) {
    const other = [...identity]
    other[i] = i === 1 ? 2 : i === 0 ? 'another-release' : 'f'.repeat(64)
    expect(readSourceReviewView(JSON.stringify(other)).view).toEqual(defaultSourceReviewView())
  }
  expect(
    Object.keys(JSON.parse(localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)!).entries[0].view),
  ).toEqual([
    'search',
    'pendingOnly',
    'pendingFirst',
    'partFilter',
    'partSearch',
    'pendingPartsFirst',
  ])
})
it('retains ten recently used comparisons and touches reopened views', () => {
  for (let i = 0; i < 10; i++)
    saveSourceReviewView(key(i), {
      search: `query-${i}`,
      pendingOnly: true,
      pendingFirst: false,
      partFilter: null,
      partSearch: '',
      pendingPartsFirst: false,
    })
  saveSourceReviewView(key(), readSourceReviewView(key()).view)
  saveSourceReviewView(key(10), {
    search: 'new',
    pendingOnly: false,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  expect(readSourceReviewView(key()).view.search).toBe('query-0')
  expect(readSourceReviewView(key(1)).view).toEqual(defaultSourceReviewView())
  expect(JSON.parse(localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)!).entries).toHaveLength(10)
})
it('ignores invalid records and rejects invalid keys or excessive queries', () => {
  for (const raw of [
    '{',
    JSON.stringify({ schemaVersion: 2, entries: [] }),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          key: key(),
          view: {
            search: 5,
            pendingOnly: true,
            pendingFirst: false,
            partFilter: null,
            partSearch: '',
            pendingPartsFirst: false,
          },
        },
      ],
    }),
  ]) {
    localStorage.setItem(SOURCE_REVIEW_VIEWS_KEY, raw)
    expect(readSourceReviewView(key())).toEqual({ view: defaultSourceReviewView(), failed: false })
  }
  expect(
    saveSourceReviewView('wrong', {
      search: '',
      pendingOnly: false,
      pendingFirst: false,
      partFilter: null,
      partSearch: '',
      pendingPartsFirst: false,
    }),
  ).toBe(false)
  expect(
    saveSourceReviewView(key(), {
      search: 'x'.repeat(4097),
      pendingOnly: false,
      pendingFirst: false,
      partFilter: null,
      partSearch: '',
      pendingPartsFirst: false,
    }),
  ).toBe(false)
})
it('restores on mount, saves reset defaults, and isolates source changes without writing old filters to a new comparison', async () => {
  saveSourceReviewView(key(), {
    search: 'saved',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  saveSourceReviewView(key(1), {
    search: 'other',
    pendingOnly: false,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  const hook = renderHook(({ identity }) => useSourceReviewView(identity), {
    initialProps: { identity: key() },
  })
  expect(hook.result.current.search).toBe('saved')
  hook.rerender({ identity: key(1) })
  expect(hook.result.current.search).toBe('other')
  expect(readSourceReviewView(key()).view.search).toBe('saved')
  act(() => {
    hook.result.current.setSearch('')
    hook.result.current.setPendingOnly(false)
  })
  await waitFor(() => expect(readSourceReviewView(key(1)).view).toEqual(defaultSourceReviewView()))
  hook.unmount()
  const reopened = renderHook(() => useSourceReviewView(key(1)))
  expect(reopened.result.current.search).toBe('')
  expect(reopened.result.current.pendingOnly).toBe(false)
})
it('reports failed writes, keeps edits usable and retries the latest view', async () => {
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  const hook = renderHook(() => useSourceReviewView(key()))
  await waitFor(() => expect(hook.result.current.failed).toBe(true))
  act(() => {
    hook.result.current.setSearch('latest')
    hook.result.current.setPendingOnly(true)
  })
  await waitFor(() => expect(hook.result.current.failed).toBe(true))
  expect(hook.result.current.search).toBe('latest')
  write.mockRestore()
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.failed).toBe(false))
  expect(readSourceReviewView(key()).view).toEqual({
    search: 'latest',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
})
it('does not overwrite a view after a failed read and retries restoration before any edit', async () => {
  saveSourceReviewView(key(), {
    search: 'valuable',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  const hook = renderHook(() => useSourceReviewView(key()))
  expect(hook.result.current.failed).toBe(true)
  read.mockRestore()
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.search).toBe('valuable'))
  expect(hook.result.current.pendingOnly).toBe(true)
  expect(readSourceReviewView(key()).view.search).toBe('valuable')
})

it('forgets all source views only, preserves current filters and pauses later writes until resume', async () => {
  saveSourceReviewView(key(), {
    search: 'first',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  saveSourceReviewView(key(1), {
    search: 'second',
    pendingOnly: false,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  localStorage.setItem('unrelated-setting', 'keep')
  const hook = renderHook(() => useSourceReviewView(key()))
  act(() => hook.result.current.forget())
  expect(localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)).toBeNull()
  expect(localStorage.getItem('unrelated-setting')).toBe('keep')
  expect(hook.result.current.search).toBe('first')
  expect(hook.result.current.pendingOnly).toBe(true)
  expect(hook.result.current.paused).toBe(true)
  act(() => {
    hook.result.current.setSearch('new while paused')
    hook.result.current.setPendingOnly(false)
  })
  expect(localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)).toBeNull()
  act(() => hook.result.current.resume())
  await waitFor(() => expect(hook.result.current.paused).toBe(false))
  expect(readSourceReviewView(key()).view).toEqual({
    search: 'new while paused',
    pendingOnly: false,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  expect(readSourceReviewView(key(1)).view).toEqual(defaultSourceReviewView())
})

it('keeps saving active if clearing fails and retains pause after a failed resume', async () => {
  const hook = renderHook(() => useSourceReviewView(key()))
  act(() => hook.result.current.setSearch('keep'))
  const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  act(() => hook.result.current.forget())
  expect(hook.result.current.actionError).toContain('Could not clear')
  expect(hook.result.current.paused).toBe(false)
  expect(readSourceReviewView(key()).view.search).toBe('keep')
  remove.mockRestore()
  act(() => hook.result.current.forget())
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Quota')
  })
  act(() => hook.result.current.resume())
  expect(hook.result.current.paused).toBe(true)
  expect(hook.result.current.actionError).toContain('Saving remains paused')
  expect(localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)).toBeNull()
  write.mockRestore()
  act(() => hook.result.current.resume())
  expect(hook.result.current.paused).toBe(false)
  expect(hook.result.current.actionError).toBe('')
})

it('reopens forgotten views with defaults and resumes saving only for the reopened review', () => {
  saveSourceReviewView(key(), {
    search: 'old',
    pendingOnly: true,
    pendingFirst: false,
    partFilter: null,
    partSearch: '',
    pendingPartsFirst: false,
  })
  const first = renderHook(() => useSourceReviewView(key()))
  act(() => first.result.current.forget())
  act(() => first.result.current.setSearch('must not persist'))
  first.unmount()
  const reopened = renderHook(() => useSourceReviewView(key()))
  expect(reopened.result.current.search).toBe('')
  expect(reopened.result.current.pendingOnly).toBe(false)
  expect(reopened.result.current.paused).toBe(false)
  act(() => reopened.result.current.setSearch('now saved'))
  expect(readSourceReviewView(key()).view.search).toBe('now saved')
})

it('restores legacy views without pending-first and persists the new ordering preference', () => {
  localStorage.setItem(
    SOURCE_REVIEW_VIEWS_KEY,
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ key: key(), view: { search: 'legacy', pendingOnly: true } }],
    }),
  )
  const hook = renderHook(() => useSourceReviewView(key()))
  expect(hook.result.current.search).toBe('legacy')
  expect(hook.result.current.pendingOnly).toBe(true)
  expect(hook.result.current.pendingFirst).toBe(false)
  act(() => hook.result.current.setPendingFirst(true))
  hook.unmount()
  const reopened = renderHook(() => useSourceReviewView(key()))
  expect(reopened.result.current.pendingFirst).toBe(true)
})

it('remembers part selection, search and ordering and migrates old views to safe part defaults', () => {
  localStorage.setItem(
    SOURCE_REVIEW_VIEWS_KEY,
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ key: key(), view: { search: 'legacy', pendingOnly: true, pendingFirst: true } }],
    }),
  )
  const hook = renderHook(() => useSourceReviewView(key()))
  expect(hook.result.current.partFilter).toBeNull()
  expect(hook.result.current.partSearch).toBe('')
  expect(hook.result.current.pendingPartsFirst).toBe(false)
  act(() => {
    hook.result.current.setPartFilter('part-a')
    hook.result.current.setPartSearch('panel')
    hook.result.current.setPendingPartsFirst(true)
  })
  hook.unmount()
  const reopened = renderHook(() => useSourceReviewView(key()))
  expect(reopened.result.current.partFilter).toBe('part-a')
  expect(reopened.result.current.partSearch).toBe('panel')
  expect(reopened.result.current.pendingPartsFirst).toBe(true)
  expect(reopened.result.current.search).toBe('legacy')
})

it('rejects malformed part preferences without applying partial settings', () => {
  for (const patch of [
    { partFilter: 5 },
    { partSearch: 'x'.repeat(4097) },
    { pendingPartsFirst: 'yes' },
  ]) {
    localStorage.setItem(
      SOURCE_REVIEW_VIEWS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ key: key(), view: { search: 'bad', pendingOnly: true, ...patch } }],
      }),
    )
    expect(readSourceReviewView(key()).view).toEqual(defaultSourceReviewView())
  }
})

it('roundtrips additional filters, rejects invalid combinations and defaults legacy settings', () => {
  const view = {
    ...defaultSourceReviewView(),
    reviewedOnly: true,
    pendingPartsOnly: true,
    classification: 'metadata' as const,
    changeType: 'removed' as const,
  }
  expect(saveSourceReviewView(key(), view)).toBe(true)
  expect(readSourceReviewView(key()).view).toEqual(view)
  expect(saveSourceReviewView(key(), { ...view, pendingOnly: true })).toBe(false)
  expect(saveSourceReviewView(key(), { ...view, changeType: 'invalid' as 'all' })).toBe(false)
  expect(readSourceReviewView(key()).view).toEqual(view)
})

it('restores the new filters and keeps pending and reviewed modes mutually exclusive', async () => {
  const hook = renderHook(() => useSourceReviewView(key()))
  act(() => {
    hook.result.current.setReviewedOnly(true)
    hook.result.current.setPendingPartsOnly(true)
    hook.result.current.setClassification('manufacturing')
    hook.result.current.setChangeType('added')
  })
  await waitFor(() => expect(readSourceReviewView(key()).view.classification).toBe('manufacturing'))
  hook.unmount()
  const reopened = renderHook(() => useSourceReviewView(key()))
  expect(reopened.result.current.reviewedOnly).toBe(true)
  expect(reopened.result.current.pendingPartsOnly).toBe(true)
  expect(reopened.result.current.changeType).toBe('added')
  act(() => reopened.result.current.setPendingOnly(true))
  expect(reopened.result.current.reviewedOnly).toBe(false)
  expect(reopened.result.current.pendingOnly).toBe(true)
  act(() => reopened.result.current.setReviewedOnly(true))
  expect(reopened.result.current.pendingOnly).toBe(false)
})

it('remembers triage filters and part ordering, validates enums and defaults legacy settings', async () => {
  const hook = renderHook(() => useSourceReviewView(key()))
  expect(hook.result.current.findingGroup).toBe('all')
  expect(hook.result.current.entityType).toBe('all')
  expect(hook.result.current.noteFilter).toBe('all')
  expect(hook.result.current.partSort).toBe('comparison')
  act(() => {
    hook.result.current.setFindingGroup('item')
    hook.result.current.setEntityType('hardware')
    hook.result.current.setNoteFilter('with')
    hook.result.current.setPartSort('name')
  })
  await waitFor(() => expect(readSourceReviewView(key()).view.partSort).toBe('name'))
  hook.unmount()
  const reopened = renderHook(() => useSourceReviewView(key()))
  expect(reopened.result.current.findingGroup).toBe('item')
  expect(reopened.result.current.entityType).toBe('hardware')
  expect(reopened.result.current.noteFilter).toBe('with')
  expect(reopened.result.current.partSort).toBe('name')
  for (const field of ['findingGroup', 'entityType', 'noteFilter', 'partSort'])
    expect(saveSourceReviewView(key(), { ...defaultSourceReviewView(), [field]: 'invalid' })).toBe(
      false,
    )
  reopened.rerender()
  act(() => {
    reopened.result.current.setFindingGroup('all')
    reopened.result.current.setEntityType('all')
    reopened.result.current.setNoteFilter('all')
    reopened.result.current.setPartSort('comparison')
  })
  await waitFor(() => expect(readSourceReviewView(key()).view.noteFilter).toBe('all'))
})
