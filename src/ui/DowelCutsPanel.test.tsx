import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DowelCutsPanel } from './DowelCutsPanel'
import type { CylinderPart } from '../scene/types'

function dowel(): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
    visible: true,
  }
}

describe('DowelCutsPanel', () => {
  it('renders an arm button for each tool and the existing cut row', () => {
    render(
      <DowelCutsPanel part={dowel()} dowelTool={null} armDowelTool={vi.fn()} onUpdate={vi.fn()} />,
    )
    // exact names: the row also has an "End: +Z" toggle, so a /end/i regex would be ambiguous
    expect(screen.getByRole('button', { name: 'End' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notch' })).toBeTruthy()
    expect(screen.getByText(/End 1/)).toBeTruthy()
    // the end cut exposes an angle input
    expect(screen.getByLabelText(/angle/i)).toBeTruthy()
  })
})
