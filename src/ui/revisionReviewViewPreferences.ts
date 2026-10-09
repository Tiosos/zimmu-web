import type { PacketRevisionReport } from './compareProductionPackets'

export interface RevisionReviewViewPreferences {
  selected: string
  pendingOnly: boolean
  search: string
  partFilter: string | null
  pendingPartsFirst: boolean
  partSearch: string
  classification: 'all' | 'manufacturing' | 'metadata'
  coverageSearch: { outputs: string; limitations: string }
  coveragePendingFirst: { outputs: boolean; limitations: boolean }
}

const key = 'zimmu:revision-review-views:v1'
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 4096
const pair = (report: PacketRevisionReport) =>
  /^[a-f0-9]{64}$/.test(report.before.sha256 ?? '') &&
  /^[a-f0-9]{64}$/.test(report.after.sha256 ?? '')
    ? `${report.before.sha256}:${report.after.sha256}`
    : null
const viewOf = (value: unknown): RevisionReviewViewPreferences | null => {
  if (
    !object(value) ||
    !string(value.selected) ||
    !string(value.search) ||
    !string(value.partSearch) ||
    !(value.partFilter === null || string(value.partFilter)) ||
    typeof value.pendingOnly !== 'boolean' ||
    typeof value.pendingPartsFirst !== 'boolean' ||
    !['all', 'manufacturing', 'metadata'].includes(value.classification as string) ||
    !object(value.coverageSearch) ||
    !string(value.coverageSearch.outputs) ||
    !string(value.coverageSearch.limitations) ||
    !object(value.coveragePendingFirst) ||
    typeof value.coveragePendingFirst.outputs !== 'boolean' ||
    typeof value.coveragePendingFirst.limitations !== 'boolean'
  )
    return null
  return {
    selected: value.selected,
    search: value.search,
    partSearch: value.partSearch,
    partFilter: value.partFilter,
    pendingOnly: value.pendingOnly,
    pendingPartsFirst: value.pendingPartsFirst,
    classification: value.classification as RevisionReviewViewPreferences['classification'],
    coverageSearch: {
      outputs: value.coverageSearch.outputs,
      limitations: value.coverageSearch.limitations,
    },
    coveragePendingFirst: {
      outputs: value.coveragePendingFirst.outputs,
      limitations: value.coveragePendingFirst.limitations,
    },
  }
}
const entries = (): { pair: string; view: RevisionReviewViewPreferences }[] => {
  const raw = localStorage.getItem(key)
  if (!raw || raw.length > 512 * 1024) return []
  const value: unknown = JSON.parse(raw)
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 10
  )
    return []
  return value.entries.flatMap((entry) => {
    if (
      !object(entry) ||
      typeof entry.pair !== 'string' ||
      !/^[a-f0-9]{64}:[a-f0-9]{64}$/.test(entry.pair)
    )
      return []
    const view = viewOf(entry.view)
    return view ? [{ pair: entry.pair, view }] : []
  })
}
export const defaultRevisionReviewView = (
  report: PacketRevisionReport,
): RevisionReviewViewPreferences => ({
  selected: report.changes[0]?.reference ?? '',
  pendingOnly: false,
  search: '',
  partFilter: null,
  pendingPartsFirst: false,
  partSearch: '',
  classification: 'all',
  coverageSearch: { outputs: '', limitations: '' },
  coveragePendingFirst: { outputs: false, limitations: false },
})
export function readRevisionReviewView(
  report: PacketRevisionReport,
): RevisionReviewViewPreferences {
  const defaults = defaultRevisionReviewView(report),
    identity = pair(report)
  if (!identity) return defaults
  try {
    const view = entries().find((entry) => entry.pair === identity)?.view
    if (!view) return defaults
    return {
      ...view,
      selected: report.changes.some((change) => change.reference === view.selected)
        ? view.selected
        : defaults.selected,
      partFilter: report.changes.some((change) => change.partId === view.partFilter)
        ? view.partFilter
        : null,
    }
  } catch {
    return defaults
  }
}
export function saveRevisionReviewView(
  report: PacketRevisionReport,
  input: RevisionReviewViewPreferences,
): void {
  const identity = pair(report),
    view = viewOf(input)
  if (!identity || !view) return
  try {
    let previous: ReturnType<typeof entries>
    try {
      previous = entries()
    } catch {
      previous = []
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          ...previous.filter((entry) => entry.pair !== identity),
          { pair: identity, view },
        ].slice(-10),
      }),
    )
  } catch {
    /* View preferences are optional; review content stays in memory. */
  }
}
