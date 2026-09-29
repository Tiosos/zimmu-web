import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RoomGeometryPanel } from './RoomGeometryPanel'
import { emptyRoomGeometry } from '../scene/projectStructure'

describe('room site measurements', () => {
  afterEach(cleanup)

  it('does not convert a drawn wall length into an unverified site measurement', () => {
    const onChange = vi.fn()
    render(<RoomGeometryPanel geometry={{ ...emptyRoomGeometry(), walls: [{ id: 'wall', name: 'Kitchen',
      start: { x: 0, y: 0 }, end: { x: 3983, y: 0 },
    }] }} cabinets={[]} scene={{ parts: [], materials: {}, hardware: [], joints: [], components: [] }} onChange={onChange} />)
    const record = screen.getByRole('button', { name: 'Record measurement' }) as HTMLButtonElement
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Site measured length for Kitchen'), { target: { value: '3978' } })
    fireEvent.change(screen.getByLabelText('Measurement source for Kitchen'), { target: { value: 'Site tape by designer' } })
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Measurement uncertainty for Kitchen'), { target: { value: '10' } })
    expect(record.disabled).toBe(false)
    fireEvent.click(record)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ walls: [expect.objectContaining({
      measuredLength: expect.objectContaining({ value: 3978, source: 'Site tape by designer', uncertainty: 10 }),
    })] }))
  })

  it('requires explicit hinge, side and reach before recording a room-door swing', () => {
    const onChange = vi.fn()
    render(<RoomGeometryPanel geometry={{ ...emptyRoomGeometry(), walls: [{ id: 'wall', name: 'Entry',
      start: { x: 0, y: 0 }, end: { x: 3000, y: 0 },
    }], openings: [{ id: 'door', wallId: 'wall', kind: 'door', offset: 500, width: 900,
      sill: 0, height: 2100 }] }} cabinets={[]} scene={{ parts: [], materials: {}, hardware: [], joints: [], components: [] }}
      onChange={onChange} />)
    const record = screen.getByRole('button', { name: 'Record swing' }) as HTMLButtonElement
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Hinge for door'), { target: { value: 'end' } })
    fireEvent.change(screen.getByLabelText('Swing side for door'), { target: { value: 'right' } })
    expect(record.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Swing reach for door'), { target: { value: '850' } })
    fireEvent.click(record)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ openings: [expect.objectContaining({
      swing: { hinge: 'end', side: 'right', radius: 850 },
    })] }))
  })
})
