import { describe, expect, it } from 'vitest'
import { buildProductionReview, type ProductionReviewInput } from './productionReview'

const inputOf = (): ProductionReviewInput => ({
  manufacturing: { findings: [], unassessed: [] },
  production: { findings: [], intentionalContacts: 0, joineryComplete: true },
  machiningReconciliation: {
    schemaVersion: 1,
    status: 'passed',
    compared: 1,
    totalFindings: 0,
    findings: [],
    unassessed: [],
  },
  cabinets: [],
})
describe('production packet review', () => {
  it('distinguishes corrections, advisories and unknown checks without an approval status', () => {
    const input = inputOf()
    input.manufacturing.findings = [
      {
        reference: 'M1',
        code: 'part-size',
        message: 'Invalid stock',
        targets: [{ id: 'part', label: 'Board', cabinetId: null, parentId: null }],
      },
      { reference: 'M2', code: 'label-empty', message: 'Empty label', targets: [] },
    ]
    input.production.findings = [
      { kind: 'joinery', message: 'Review joint', targets: [] },
      { kind: 'unassessed', message: 'Skipped geometry', targets: [] },
    ]
    const review = buildProductionReview(input)
    expect(review).toMatchObject({
      status: 'needs-correction',
      counts: { needsCorrection: 1, advisory: 2, unassessed: 1 },
    })
    expect(review.scope).toContain('not fabrication approval')
    expect(review.items.find((i) => i.code === 'part-size')?.targets[0].id).toBe('part')
  })
  it('never treats an unassessed scan or empty machining assessment as success', () => {
    const input = inputOf()
    expect(buildProductionReview(input).status).toBe('no-reported-findings')
    input.production.joineryComplete = false
    input.machiningReconciliation.status = 'unassessed'
    input.machiningReconciliation.compared = 0
    expect(buildProductionReview(input)).toMatchObject({
      status: 'review-required',
      counts: { needsCorrection: 0, unassessed: 2 },
    })
  })
  it('preserves stable identities across source reordering and captures operation provenance and both outputs', () => {
    const input = inputOf()
    input.machiningReconciliation.findings = [
      {
        reference: 'MR:part/op',
        kind: 'mismatch',
        partId: 'part',
        operationId: 'op',
        field: 'diameter',
        schedule: { location: 'lists/machining.csv, row 2', value: 5 },
        drawing: { location: 'drawings/shop-drawings.pdf, PDF page 4', value: 6 },
        sourceComponentId: 'jig',
        sourceJointId: 'joint',
      },
    ]
    input.production.findings = [
      {
        kind: 'missing',
        message: 'Missing bottom',
        targets: [{ label: 'Cabinet', selection: { kind: 'component', id: 'cabinet' } }],
      },
      { kind: 'geometry', message: 'Bad size', targets: [] },
    ]
    const before = buildProductionReview(input)
    input.production.findings.reverse()
    expect(buildProductionReview(input).items.map((i) => i.reference)).toEqual(
      before.items.map((i) => i.reference),
    )
    const item = before.items.find((i) => i.source === 'machining')!
    expect(item).toMatchObject({
      operationId: 'op',
      sourceComponentId: 'jig',
      sourceJointId: 'joint',
      category: 'needs-correction',
    })
    expect(item.locations).toContain('drawings/shop-drawings.pdf, PDF page 4')
    expect(item.locations).toContain('lists/machining.csv, row 2')
    input.machiningReconciliation.findings[0].drawing.location = 'Later'
    expect(item.locations).not.toContain('Later')
  })
  it('classifies omitted shelves, angled insertion, unverified routes and skipped shelf checks separately', () => {
    const input = inputOf()
    input.cabinets = [
      {
        id: 'cab',
        issues: ['Assessment skipped'],
        shelves: [
          { role: 'missing', label: 'Missing', generated: false, status: 'unplaced' },
          {
            role: 'angled',
            partId: 'shelf-board',
            label: 'Angled',
            generated: true,
            status: 'rotated',
          },
          { role: 'unknown', label: 'Unknown', generated: true, status: 'unverified' },
          { role: 'straight', label: 'Straight', generated: true, status: 'straight' },
        ],
      },
    ]
    expect(
      buildProductionReview(input).items.find((item) => item.category === 'advisory')?.targets,
    ).toContainEqual({ kind: 'part', id: 'shelf-board', label: 'Angled' })
    expect(buildProductionReview(input).counts).toEqual({
      needsCorrection: 1,
      advisory: 1,
      unassessed: 2,
    })
  })
  it('retains every original reference and location when identical source findings merge', () => {
    const input = inputOf()
    input.manufacturing.findings = ['M1', 'M2'].map((reference) => ({
      reference,
      code: 'part-size',
      message: 'Bad dimensions',
      targets: [],
    }))
    const review = buildProductionReview(input)
    expect(review.counts.needsCorrection).toBe(1)
    expect(review.items[0].sourceReferences).toEqual(['M1', 'M2'])
    expect(review.items[0].locations).toContain('readiness/manufacturing.json findings[1]')
  })

  it('keeps references compact for findings involving many parts', () => {
    const input = inputOf()
    input.manufacturing.findings = [
      {
        reference: 'M1',
        code: 'label-duplicate',
        message: 'Repeated label',
        targets: Array.from({ length: 300 }, (_, i) => ({
          id: `part-${i}`,
          label: 'Board',
          cabinetId: null,
          parentId: null,
        })),
      },
    ]
    const item = buildProductionReview(input).items[0]
    expect(item.reference).toMatch(/^PR:[0-9a-f]{16}$/)
    expect(item.targets).toHaveLength(300)
  })

  it('includes every review item beyond the dialog limit and keeps source-scoped limits distinct', () => {
    const input = inputOf()
    input.manufacturing.unassessed = ['Physical installation', 'Physical installation']
    input.machiningReconciliation.unassessed = ['Physical installation']
    input.production.findings = Array.from({ length: 205 }, (_, i) => ({
      kind: 'geometry',
      message: `Issue ${i}`,
      targets: [],
    }))
    expect(buildProductionReview(input).counts).toEqual({
      needsCorrection: 205,
      advisory: 0,
      unassessed: 2,
    })
  })
})
