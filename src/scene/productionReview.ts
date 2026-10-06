import type { ManufacturingFinding } from './manufacturingChecks'
import type { ProductionReadiness } from './productionReadiness'
import type { ShelfReadinessRow } from './shelfReadiness'
import type { reconcileMachining } from '../ui/machiningReconciliation'

export type ReviewCategory = 'needs-correction' | 'advisory' | 'unassessed'
export interface ReviewItem {
  reference: string
  source: 'manufacturing' | 'production' | 'machining' | 'shelf-access'
  sourceReference: string | null
  sourceReferences: string[]
  category: ReviewCategory
  code: string
  message: string
  targets: { kind: 'part' | 'component'; id: string; label: string }[]
  operationId: string | null
  sourceComponentId: string | null
  sourceJointId: string | null
  locations: string[]
}
export interface ProductionReviewInput {
  manufacturing: { findings: ManufacturingFinding[]; unassessed: string[] }
  production: Omit<ProductionReadiness, 'findings'> & {
    findings: (ProductionReadiness['findings'][number] & { reference?: string })[]
  }
  machiningReconciliation: ReturnType<typeof reconcileMachining>
  cabinets: {
    id: string
    issues: string[]
    shelves: Pick<ShelfReadinessRow, 'role' | 'partId' | 'label' | 'generated' | 'status'>[]
  }[]
}

// Deterministic compact finding identity. File integrity still uses the packet's SHA-256 hashes.
function reviewReference(identity: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(identity)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
  }
  return `PR:${hash.toString(16).padStart(16, '0')}`
}

// A review classification, never an export gate or a fabrication approval. Counts describe source
// findings/limits; separate engines may describe the same physical issue and are not deduplicated.
export function buildProductionReview(input: ProductionReviewInput) {
  const items: ReviewItem[] = []
  const byIdentity = new Map<string, ReviewItem>()
  const add = (item: Omit<ReviewItem, 'reference' | 'sourceReferences'>) => {
    const identity = [
      item.source,
      item.code,
      item.targets.map((t) => [t.kind, t.id]).sort(),
      item.operationId,
      item.sourceComponentId,
      item.sourceJointId,
      item.message,
    ]
    const serialized = JSON.stringify(identity)
    const reference = reviewReference(serialized)
    // Repeated identical source findings are one review item; source-specific IDs remain attached.
    const previous = byIdentity.get(serialized)
    if (previous) {
      previous.locations = [...new Set([...previous.locations, ...item.locations])].sort()
      if (item.sourceReference && !previous.sourceReferences.includes(item.sourceReference))
        previous.sourceReferences.push(item.sourceReference)
    } else {
      const entry = {
        ...structuredClone(item),
        reference,
        sourceReferences: item.sourceReference ? [item.sourceReference] : [],
      }
      byIdentity.set(serialized, entry)
      items.push(entry)
    }
  }
  const base = {
    sourceReference: null,
    operationId: null,
    sourceComponentId: null,
    sourceJointId: null,
  } as const
  const limit = (source: ReviewItem['source'], message: string, location: string) =>
    add({
      ...base,
      source,
      category: 'unassessed',
      code: 'assessment-limit',
      message,
      targets: [],
      locations: [location],
    })
  input.manufacturing.findings.forEach((f, i) =>
    add({
      ...base,
      source: 'manufacturing',
      sourceReference: f.reference,
      category:
        f.code === 'label-empty' || f.code === 'label-duplicate' ? 'advisory' : 'needs-correction',
      code: f.code,
      message: f.message,
      targets: f.targets.map((t) => ({ kind: 'part', id: t.id, label: t.label })),
      operationId: f.operation?.id ?? null,
      sourceComponentId: f.operation?.sourceComponentId ?? null,
      sourceJointId: f.operation?.sourceJointId ?? null,
      locations: [
        `readiness/manufacturing.json findings[${i}]`,
        `readiness/report.pdf, Manufacturing record checks, ${f.reference}`,
      ],
    }),
  )
  input.manufacturing.unassessed.forEach((message, i) =>
    limit('manufacturing', message, `readiness/manufacturing.json unassessed[${i}]`),
  )
  input.production.findings.forEach((f, i) =>
    add({
      ...base,
      source: 'production',
      sourceReference: f.reference ?? `F${i + 1}`,
      category:
        f.kind === 'unassessed'
          ? 'unassessed'
          : f.kind === 'joinery'
            ? 'advisory'
            : 'needs-correction',
      code: f.kind,
      message: f.message,
      targets: f.targets.map((t) => ({
        kind: t.selection.kind,
        id: t.selection.id,
        label: t.label,
      })),
      locations: [`readiness/report.pdf, production finding ${f.reference ?? `F${i + 1}`}`],
    }),
  )
  if (!input.production.joineryComplete)
    limit(
      'production',
      'Joinery scan is incomplete; unreported contacts are unknown.',
      'readiness/report.pdf, Project summary',
    )
  input.machiningReconciliation.findings.forEach((f, i) =>
    add({
      ...base,
      source: 'machining',
      sourceReference: f.reference,
      category: 'needs-correction',
      code: `${f.kind}/${f.field}`,
      message: `${f.kind}: ${f.field}. Schedule: ${JSON.stringify(f.schedule.value)}; drawing: ${JSON.stringify(f.drawing.value)}.`,
      targets: [{ kind: 'part', id: f.partId, label: f.partId }],
      operationId: f.operationId,
      sourceComponentId: f.sourceComponentId,
      sourceJointId: f.sourceJointId,
      locations: [
        `readiness/machining-reconciliation.json findings[${i}]`,
        f.schedule.location,
        f.drawing.location,
      ],
    }),
  )
  input.machiningReconciliation.unassessed.forEach((message, i) =>
    limit('machining', message, `readiness/machining-reconciliation.json unassessed[${i}]`),
  )
  if (input.machiningReconciliation.status === 'unassessed')
    limit(
      'machining',
      'No machining operations were assessed; this is not a passed check.',
      'readiness/machining-reconciliation.json status',
    )
  for (const cabinet of input.cabinets) {
    const target = { kind: 'component' as const, id: cabinet.id, label: cabinet.id }
    for (const message of cabinet.issues)
      add({
        ...base,
        source: 'shelf-access',
        category: 'unassessed',
        code: 'cabinet-assessment',
        message,
        targets: [target],
        locations: [`readiness/report.pdf, cabinet ${cabinet.id}`],
      })
    for (const shelf of cabinet.shelves) {
      if (shelf.status === 'straight' && shelf.generated) continue
      const category: ReviewCategory =
        shelf.status === 'unassessed'
          ? 'unassessed'
          : !shelf.generated || shelf.status === 'unplaced'
            ? 'needs-correction'
            : shelf.status === 'rotated'
              ? 'advisory'
              : 'unassessed'
      add({
        ...base,
        source: 'shelf-access',
        category,
        code: `shelf/${shelf.role}/${shelf.status}`,
        message: `${shelf.label} (${shelf.role}): ${!shelf.generated ? 'requested shelf board is missing; ' : ''}${shelf.status === 'rotated' ? 'angled insertion required' : shelf.status === 'unverified' ? 'no verified insertion route' : shelf.status}.`,
        targets: shelf.partId
          ? [target, { kind: 'part', id: shelf.partId, label: shelf.label }]
          : [target],
        locations: [`readiness/report.pdf, cabinet ${cabinet.id}, shelf ${shelf.role}`],
      })
    }
  }
  items.sort((a, b) => (a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0))
  const counts = {
    needsCorrection: items.filter((i) => i.category === 'needs-correction').length,
    advisory: items.filter((i) => i.category === 'advisory').length,
    unassessed: items.filter((i) => i.category === 'unassessed').length,
  }
  return {
    schemaVersion: 1 as const,
    status: counts.needsCorrection
      ? ('needs-correction' as const)
      : counts.unassessed
        ? ('review-required' as const)
        : counts.advisory
          ? ('advisory-review' as const)
          : ('no-reported-findings' as const),
    counts,
    scope:
      'Manufacturing records, production readiness, machining reconciliation and shelf access, including hidden items. Counts are review items, not unique physical defects. Exports remain available. This summary is not fabrication approval; unassessed checks require separate review.',
    classification:
      'Invalid manufacturing definitions, missing parts and output mismatches need correction. Labels, joinery reminders and angled insertion are advisory. Skipped checks, assessment limits and unverified installation are unassessed.',
    items,
  }
}
export type ProductionReview = ReturnType<typeof buildProductionReview>

export const REVIEW_STATUS_LABELS = {
  'needs-correction': 'Corrections required',
  'review-required': 'Review required',
  'advisory-review': 'Advisory review',
  'no-reported-findings': 'No reported findings',
} as const
