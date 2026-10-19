export const SOURCE_REVIEW_VIEWS_KEY = 'zimmu:source-review-views:v1'
export const MAX_SOURCE_REVIEW_VIEWS = 10
export const MAX_SOURCE_REVIEW_SEARCH = 4096
export interface SourceReviewView {
  search: string
  pendingOnly: boolean
  pendingFirst: boolean
  partFilter: string | null
  partSearch: string
  findingGroup?: 'all' | 'item' | 'source' | 'limitation'
  entityType?: 'all' | 'part' | 'hardware'
  noteFilter?: 'all' | 'with' | 'without'
  partSort?: 'comparison' | 'name'
  reviewedOnly?: boolean
  pendingPartsOnly?: boolean
  classification?: 'all' | 'manufacturing' | 'metadata'
  changeType?: 'all' | 'added' | 'removed' | 'modified'
  pendingPartsFirst: boolean
}
export const defaultSourceReviewView = (): SourceReviewView => ({
  search: '',
  pendingOnly: false,
  pendingFirst: false,
  partFilter: null,
  partSearch: '',
  pendingPartsFirst: false,
})
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
function identity(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 2048) return false
  try {
    const value: unknown = JSON.parse(key)
    return (
      Array.isArray(value) &&
      value.length === 5 &&
      typeof value[0] === 'string' &&
      value[0].length <= 256 &&
      Number.isSafeInteger(value[1]) &&
      value[1] > 0 &&
      value.slice(2).every((v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))
    )
  } catch {
    return false
  }
}
function viewOf(value: unknown): SourceReviewView | null {
  return object(value) &&
    typeof value.search === 'string' &&
    value.search.length <= MAX_SOURCE_REVIEW_SEARCH &&
    typeof value.pendingOnly === 'boolean' &&
    (value.findingGroup === undefined ||
      ['all', 'item', 'source', 'limitation'].includes(value.findingGroup as string)) &&
    (value.entityType === undefined ||
      ['all', 'part', 'hardware'].includes(value.entityType as string)) &&
    (value.noteFilter === undefined ||
      ['all', 'with', 'without'].includes(value.noteFilter as string)) &&
    (value.partSort === undefined || ['comparison', 'name'].includes(value.partSort as string)) &&
    (value.reviewedOnly === undefined || typeof value.reviewedOnly === 'boolean') &&
    !(value.reviewedOnly === true && value.pendingOnly === true) &&
    (value.pendingPartsOnly === undefined || typeof value.pendingPartsOnly === 'boolean') &&
    (value.classification === undefined ||
      ['all', 'manufacturing', 'metadata'].includes(value.classification as string)) &&
    (value.changeType === undefined ||
      ['all', 'added', 'removed', 'modified'].includes(value.changeType as string)) &&
    (value.pendingFirst === undefined || typeof value.pendingFirst === 'boolean') &&
    (value.partFilter === undefined ||
      value.partFilter === null ||
      (typeof value.partFilter === 'string' && value.partFilter.length <= 4096)) &&
    (value.partSearch === undefined ||
      (typeof value.partSearch === 'string' &&
        value.partSearch.length <= MAX_SOURCE_REVIEW_SEARCH)) &&
    (value.pendingPartsFirst === undefined || typeof value.pendingPartsFirst === 'boolean')
    ? {
        ...(value.findingGroup !== undefined
          ? { findingGroup: value.findingGroup as SourceReviewView['findingGroup'] }
          : {}),
        ...(value.entityType !== undefined
          ? { entityType: value.entityType as SourceReviewView['entityType'] }
          : {}),
        ...(value.noteFilter !== undefined
          ? { noteFilter: value.noteFilter as SourceReviewView['noteFilter'] }
          : {}),
        ...(value.partSort !== undefined
          ? { partSort: value.partSort as SourceReviewView['partSort'] }
          : {}),
        search: value.search,
        pendingOnly: value.pendingOnly,
        pendingFirst: value.pendingFirst === true,
        partFilter: typeof value.partFilter === 'string' ? value.partFilter : null,
        partSearch: typeof value.partSearch === 'string' ? value.partSearch : '',
        pendingPartsFirst: value.pendingPartsFirst === true,
        ...(value.reviewedOnly !== undefined ? { reviewedOnly: value.reviewedOnly === true } : {}),
        ...(value.pendingPartsOnly !== undefined
          ? { pendingPartsOnly: value.pendingPartsOnly === true }
          : {}),
        ...(value.classification !== undefined
          ? { classification: value.classification as SourceReviewView['classification'] }
          : {}),
        ...(value.changeType !== undefined
          ? { changeType: value.changeType as SourceReviewView['changeType'] }
          : {}),
      }
    : null
}
function entries(): { key: string; view: SourceReviewView }[] {
  const raw = localStorage.getItem(SOURCE_REVIEW_VIEWS_KEY)
  if (!raw || raw.length > 256 * 1024) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_SOURCE_REVIEW_VIEWS
  )
    return []
  const seen = new Set<string>()
  return value.entries.flatMap((entry) => {
    if (!object(entry) || !identity(entry.key) || seen.has(entry.key)) return []
    const view = viewOf(entry.view)
    if (!view) return []
    seen.add(entry.key)
    return [{ key: entry.key, view }]
  })
}
export function readSourceReviewView(key: string | null): {
  view: SourceReviewView
  failed: boolean
} {
  if (!identity(key)) return { view: defaultSourceReviewView(), failed: false }
  try {
    return {
      view: entries().find((entry) => entry.key === key)?.view ?? defaultSourceReviewView(),
      failed: false,
    }
  } catch {
    return { view: defaultSourceReviewView(), failed: true }
  }
}
export function saveSourceReviewView(key: string, input: SourceReviewView): boolean {
  const view = viewOf(input)
  if (!identity(key) || !view) return false
  try {
    const previous = entries()
    localStorage.setItem(
      SOURCE_REVIEW_VIEWS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [...previous.filter((entry) => entry.key !== key), { key, view }].slice(
          -MAX_SOURCE_REVIEW_VIEWS,
        ),
      }),
    )
    return true
  } catch {
    return false
  }
}

export function forgetSourceReviewViews(): boolean {
  try {
    localStorage.removeItem(SOURCE_REVIEW_VIEWS_KEY)
    return true
  } catch {
    return false
  }
}
