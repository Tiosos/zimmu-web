import type { PacketRevisionReport } from './compareProductionPackets'

export interface ReviewAcknowledgment {
  reference: string
  acknowledged: boolean
  note: string
}

export function revisionReviewCoverage(comparison: PacketRevisionReport) {
  return {
    outputs: comparison.otherChangedFiles.map((path) => ({
      reference: `PO:${JSON.stringify(path)}`,
      label: path,
    })),
    limitations: comparison.limitations.map((statement) => ({
      reference: `PL:${JSON.stringify(statement)}`,
      label: statement,
    })),
  }
}

export interface RevisionReviewRecord {
  schemaVersion: 2
  kind: 'local-revision-review'
  savedAt: string
  reviewer: string
  notes: string
  comparison: PacketRevisionReport
  changes: ReviewAcknowledgment[]
  outputs: ReviewAcknowledgment[]
  limitations: ReviewAcknowledgment[]
}

export function revisionReviewClassificationProgress(review: RevisionReviewRecord) {
  const acknowledged = new Set(
    review.changes.filter((item) => item.acknowledged).map((item) => item.reference),
  )
  return (['manufacturing', 'metadata'] as const).map((classification) => {
    const changes = review.comparison.changes.filter(
      (change) => change.classification === classification,
    )
    const checked = changes.filter((change) => acknowledged.has(change.reference)).length
    return {
      classification,
      acknowledged: checked,
      pending: changes.length - checked,
      total: changes.length,
    }
  })
}

export function createRevisionReview(comparison: PacketRevisionReport): RevisionReviewRecord {
  if (comparison.status === 'blocked' || !comparison.before.sha256 || !comparison.after.sha256)
    throw new Error('A verified comparison with both packet hashes is required.')
  const coverage = revisionReviewCoverage(comparison)
  const unchecked = ({ reference }: { reference: string }): ReviewAcknowledgment => ({
    reference,
    acknowledged: false,
    note: '',
  })
  return {
    schemaVersion: 2,
    kind: 'local-revision-review',
    savedAt: new Date().toISOString(),
    reviewer: '',
    notes: '',
    comparison,
    changes: comparison.changes.map(unchecked),
    outputs: coverage.outputs.map(unchecked),
    limitations: coverage.limitations.map(unchecked),
  }
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

export function importRevisionReview(
  input: unknown,
  comparison: PacketRevisionReport,
): RevisionReviewRecord {
  const fresh = createRevisionReview(comparison)
  if (!input || typeof input !== 'object') throw new Error('Invalid revision review record.')
  const record = input as Omit<Partial<RevisionReviewRecord>, 'schemaVersion'> & {
    schemaVersion?: number
  }
  if (
    (record.schemaVersion !== 1 && record.schemaVersion !== 2) ||
    record.kind !== fresh.kind ||
    typeof record.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.savedAt)) ||
    typeof record.reviewer !== 'string' ||
    typeof record.notes !== 'string' ||
    !Array.isArray(record.changes)
  )
    throw new Error('Invalid revision review record.')
  if (
    record.comparison?.before?.sha256 !== comparison.before.sha256 ||
    record.comparison?.after?.sha256 !== comparison.after.sha256
  )
    throw new Error('This review belongs to different packet hashes or a different revision order.')
  if (canonical(record.comparison) !== canonical(comparison))
    throw new Error(
      'The saved comparison does not match the current comparison. Start a new review.',
    )
  const changes = validateAcknowledgments(record.changes, fresh.changes, 'change')
  if (
    record.schemaVersion === 1 &&
    (record.outputs !== undefined || record.limitations !== undefined)
  )
    throw new Error('Version-1 reviews cannot contain output or limitation acknowledgments.')
  const outputs =
    record.schemaVersion === 1
      ? fresh.outputs
      : validateAcknowledgments(record.outputs, fresh.outputs, 'output')
  const limitations =
    record.schemaVersion === 1
      ? fresh.limitations
      : validateAcknowledgments(record.limitations, fresh.limitations, 'limitation')
  return {
    ...fresh,
    savedAt: record.savedAt,
    reviewer: record.reviewer,
    notes: record.notes,
    changes,
    outputs,
    limitations,
  }
}

function validateAcknowledgments(
  input: unknown,
  expected: ReviewAcknowledgment[],
  group: string,
): ReviewAcknowledgment[] {
  if (!Array.isArray(input)) throw new Error(`Missing ${group} acknowledgments.`)
  const entries = new Map<string, ReviewAcknowledgment>()
  for (const entry of input) {
    if (
      !entry ||
      typeof entry.reference !== 'string' ||
      typeof entry.acknowledged !== 'boolean' ||
      typeof entry.note !== 'string' ||
      entries.has(entry.reference)
    )
      throw new Error(`Invalid or duplicate ${group} acknowledgments.`)
    entries.set(entry.reference, {
      reference: entry.reference,
      acknowledged: entry.acknowledged,
      note: entry.note,
    })
  }
  if (entries.size !== expected.length || expected.some(({ reference }) => !entries.has(reference)))
    throw new Error(`The review ${group} references do not match this comparison.`)
  return expected.map(({ reference }) => entries.get(reference)!)
}
