import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RoomAssessmentPanel } from './RoomAssessmentPanel'
import { emptyRoomGeometry } from '../scene/projectStructure'
import { CARCASE_PRESETS, DEFAULT_FRAME, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { CarcaseComponent } from '../scene/types'

describe('room assessment panel', () => {
  afterEach(cleanup)

  it('requires an explicit datum, source and uncertainty before recording a signed level', () => {
    const onChange = vi.fn()
    const scene = { parts: [], materials: {}, hardware: [], joints: [], components: [] }
    const { rerender } = render(<RoomAssessmentPanel room={emptyRoomGeometry()} scene={scene}
      cabinetIds={new Set()} onChange={onChange} />)
    const record = screen.getByRole('button', { name: 'Record level' }) as HTMLButtonElement
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Level datum'), { target: { value: 'Project ±0' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ datum: 'Project ±0' }))
    rerender(<RoomAssessmentPanel room={{ ...emptyRoomGeometry(), datum: 'Project ±0' }} scene={scene}
      cabinetIds={new Set()} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Level point name'), { target: { value: 'Corner' } })
    fireEvent.change(screen.getByLabelText('Elevation mm'), { target: { value: '-12' } })
    fireEvent.change(screen.getByLabelText('Level source'), { target: { value: 'Site laser' } })
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Uncertainty ±mm'), { target: { value: '2' } })
    expect(record.disabled).toBe(false)
    fireEvent.click(record)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ siteLevels: [expect.objectContaining({
      elevation: expect.objectContaining({ value: -12, uncertainty: 2, source: 'Site laser' }),
    })] }))
  })

  it('shows dimensioned wall opening and site level evidence separately', () => {
    const room = { ...emptyRoomGeometry(), datum: 'Project ±0', walls: [{ id: 'wall', name: 'Kitchen',
      start: { x: 0, y: 0 }, end: { x: 3983, y: 0 } }],
      openings: [{ id: 'window', wallId: 'wall', kind: 'window' as const, offset: 800,
        width: 1200, sill: 900, height: 1100 }],
      siteLevels: [{ id: 'level', name: 'Corner', at: { x: 0, y: 0 },
        elevation: { value: -12, uncertainty: 2, source: 'Site laser', recordedAt: '2026-09-29' } }],
    }
    render(<RoomAssessmentPanel room={room} scene={{ parts: [], materials: {}, hardware: [], joints: [], components: [] }}
      cabinetIds={new Set()} onChange={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Elevation of Kitchen' })).toBeTruthy()
    expect(screen.getByTestId('elevation-window')).toBeTruthy()
    expect(screen.getByText(/Corner: -12 ±2 mm/)).toBeTruthy()
    expect((screen.getByLabelText('Level datum') as HTMLInputElement).disabled).toBe(true)
  })

  it('offers an assessment for an independent physical face-frame opening', () => {
    const params = CARCASE_PRESETS[0].params
    const cabinet: CarcaseComponent = { kind: 'carcase', id: 'framed', label: 'Framed', parentId: null,
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', visible: true,
      params: { ...params, frame: { ...DEFAULT_FRAME, layout: {
        [params.section.id]: { id: 'physical-door', size: { kind: 'equal' },
          front: { kind: 'door', leaves: 1, hinge: 'left' }, content: { kind: 'leaf' } },
      } } },
    }
    const onChange = vi.fn()
    render(<RoomAssessmentPanel room={emptyRoomGeometry()}
      scene={{ parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components: [cabinet] }}
      cabinetIds={new Set([cabinet.id])} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Projection for Framed physical-door'), { target: { value: '600' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ clearances: [
      { cabinetId: 'framed', sectionId: 'physical-door', kind: 'door', projection: 600 },
    ] }))
  })
})
