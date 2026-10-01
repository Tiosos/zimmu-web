import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReconciliationSection } from './ReconciliationSection'
import { ALWAYS_UNASSESSED, type ReconResult } from './outputReconciliation'

const failed: ReconResult = {
  status: 'failed',
  compared: 3,
  totalFindings: 1,
  truncated: false,
  unassessed: ALWAYS_UNASSESSED,
  findings: [
    {
      kind: 'mismatch',
      partId: 'p1',
      label: 'Bottom',
      field: 'size',
      left: { source: 'drawings, sheet 4', value: '564×520×18' },
      right: { source: 'cutlist row 2 (Base 600)', value: '564×521×18' },
    },
  ],
}

describe('ReconciliationSection', () => {
  afterEach(cleanup)

  it('says what it checked and shows a failing finding with both values and sources', () => {
    render(<ReconciliationSection result={failed} />)
    expect(screen.getByText('Production packet drawings and lists agree?')).toBeTruthy()
    expect(screen.getByText(/Failed/i)).toBeTruthy()
    expect(screen.getByText(/564×520×18/)).toBeTruthy()
    expect(screen.getByText(/564×521×18/)).toBeTruthy()
    expect(screen.getByText(/drawings, sheet 4/)).toBeTruthy()
    expect(screen.getByText(/cutlist row 2/)).toBeTruthy()
  })

  it('always lists what was not compared', () => {
    render(
      <ReconciliationSection
        result={{ ...failed, status: 'passed', findings: [], totalFindings: 0 }}
      />,
    )
    for (const line of ALWAYS_UNASSESSED) expect(screen.getByText(line)).toBeTruthy()
  })

  it('lets a finding be inspected', () => {
    const onInspect = vi.fn()
    render(<ReconciliationSection result={failed} onInspect={onInspect} />)
    fireEvent.click(screen.getByRole('button', { name: /Inspect Bottom/ }))
    expect(onInspect).toHaveBeenCalledWith({ kind: 'part', id: 'p1' })
  })

  it('says when findings were truncated', () => {
    render(<ReconciliationSection result={{ ...failed, truncated: true, totalFindings: 250 }} />)
    expect(screen.getByText(/first 200 of 250/i)).toBeTruthy()
  })
})
