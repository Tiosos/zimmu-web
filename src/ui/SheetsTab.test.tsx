import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { SheetsTab } from './SheetsTab'
import type { NestReport } from '../scene/useNest'

afterEach(cleanup)

const SHEET = { length: 2440, width: 1220 }

function report(over: Partial<NestReport> = {}): NestReport {
  return {
    material: '18mm Ply',
    sheet: SHEET,
    result: {
      sheets: [
        [{ id: 'p1', sheet: 0, rotation: 0, x: 0, y: 0, w: 1220, h: 610 }],
        [{ id: 'p2', sheet: 1, rotation: 90, x: 0, y: 0, w: 610, h: 305 }],
      ],
      utilisation: [0.25, 0.0625],
      unplaced: [],
    },
    ...over,
  }
}

function renderTab(over: Partial<Parameters<typeof SheetsTab>[0]> = {}) {
  render(
    <SheetsTab
      reports={[report()]}
      pending={false}
      materials={{ '18mm Ply': { sheet: SHEET } }}
      labelOf={(id) => `Part ${id}`}
      {...over}
    />,
  )
}

describe('SheetsTab', () => {
  it('tells the user how to get a nest when nothing has sheet stock', () => {
    renderTab({ reports: [] })
    expect(screen.getByText(/Library tab/)).toBeTruthy()
  })

  it('shows a pending state while nesting', () => {
    renderTab({ pending: true })
    expect(screen.getByText(/Nesting/)).toBeTruthy()
  })

  it('reports the sheet count and utilisation per material', () => {
    renderTab()
    const row = screen.getByTestId('sheets-row-18mm Ply')
    expect(within(row).getByText('2')).toBeTruthy()
    // 25% and 6.25% average to 15.6%; quoted to a whole percent because the mask is a 1 mm raster
    // and the design doc is explicit that utilisation must not be quoted finely.
    expect(within(row).getByText('16%')).toBeTruthy()
  })

  it('draws one SVG per sheet', () => {
    const { container } = render(
      <SheetsTab
        reports={[report()]}
        pending={false}
        materials={{ '18mm Ply': { sheet: SHEET } }}
        labelOf={(id) => id}
      />,
    )
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('names the parts that did not fit rather than hiding them', () => {
    renderTab({
      reports: [
        report({
          result: { ...report().result, unplaced: ['big1', 'big2'] },
        }),
      ],
    })
    expect(screen.getByText(/Part big1/)).toBeTruthy()
    expect(screen.getByText(/Part big2/)).toBeTruthy()
  })

  it('prices by cost per sheet when the material has one', () => {
    renderTab({ materials: { '18mm Ply': { sheet: { ...SHEET, costPerSheet: 60 } } } })
    const row = screen.getByTestId('sheets-row-18mm Ply')
    expect(within(row).getByText('$120.00')).toBeTruthy()
    expect(within(row).getByText(/per sheet/)).toBeTruthy()
  })

  it('falls back to the areal rate when there is no per-sheet price', () => {
    renderTab({ materials: { '18mm Ply': { sheet: SHEET, costPerM2: 40 } } })
    const row = screen.getByTestId('sheets-row-18mm Ply')
    // Placed material area, not sheet area: 1220x610 + 610x305 = 0.930... m2 at $40.
    expect(within(row).getByText(/^\$3[0-9]\./)).toBeTruthy()
    expect(within(row).getByText(/per m²/)).toBeTruthy()
  })

  it('says so when a material has no rate at all', () => {
    renderTab({ materials: { '18mm Ply': { sheet: SHEET } } })
    const row = screen.getByTestId('sheets-row-18mm Ply')
    expect(within(row).getByText('—')).toBeTruthy()
  })
})
