import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DrawingViewer } from './DrawingViewer'
import { buildDrawingSheets } from '../geom/drawing'
import * as downloadModule from './download'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import type { BoardPart, Component, ComponentId, CylinderPart } from '../scene/types'

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

// Mock heavy serializers — component tests focus on UI behaviour, not SVG/DXF output.
vi.mock('./buildSvg', () => ({
  buildSvg: (sheet: { kind: string }) => `<svg data-testid="svg-${sheet.kind}"></svg>`,
}))
vi.mock('./buildDxf', () => ({
  buildDxf: () => 'mock-dxf',
}))

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 400,
    width: 200,
    thickness: 18,
    grain: 'free' as const,
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

const sheets = buildDrawingSheets(
  [makeBoard({ id: 'p1', label: 'Top' }), makeBoard({ id: 'p2', label: 'Side' })],
  'Cabinet',
)

function makeDowel(overrides: Partial<CylinderPart> = {}): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel',
    diameter: 20,
    length: 100,
    material: 'Beech',
    color: '#cc99aa',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

describe('DrawingViewer', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders nothing when open=false', () => {
    render(<DrawingViewer open={false} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.queryByText('2D Drawings')).toBeNull()
  })

  it('renders the viewer header when open=true', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.getByText('2D Drawings')).toBeTruthy()
  })

  it('shows "Cover" label for the first sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('Next button advances to next sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/Part 1 of 2/)).toBeTruthy()
  })

  it('Prev button goes back to previous sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    fireEvent.click(screen.getByRole('button', { name: '←' }))
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('ArrowRight key advances sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText(/Part 1 of 2/)).toBeTruthy()
  })

  it('ArrowLeft key goes back', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('Close button calls onClose', () => {
    const onClose = vi.fn()
    render(<DrawingViewer open={true} onClose={onClose} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Download SVG calls downloadBlob with .svg extension', () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Download SVG/ }))
    // The cover's own name, not just the extension: `sheetFilename` moved out to be shared, and a
    // branch of it that no test names is one the move is free to lose.
    expect(spy).toHaveBeenCalledWith(expect.any(String), 'cabinet-cover.svg', 'image/svg+xml')
  })

  it('Download DXF calls downloadBlob with .dxf extension', () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Download DXF/ }))
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.dxf$/),
      'application/dxf',
    )
  })

  it('Print button creates an iframe element', () => {
    const spy = vi.spyOn(document, 'createElement')
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /^Print this/ }))
    expect(spy).toHaveBeenCalledWith('iframe')
  })

  // The deck is [cover, assembly, part], which is what made `Part ${idx} of ${sheets.length - 1}`
  // lie: it assumed sheet 0 was the cover and every other sheet a part, so the one board read
  // "Part 2 of 2". The numbering is over the part sheets themselves.
  it('numbers the part sheets among themselves, not by their place in the deck', () => {
    const cabinetSheets = buildDrawingSheets([makeBoard({ label: 'Top' })], 'Job', [
      { cabinet, parts: partsOfBase600(), byId, materials: PRESET_MATERIALS },
    ])
    render(<DrawingViewer open onClose={vi.fn()} sheets={cabinetSheets} projectName="Job" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/Part 1 of 1 — Top/)).toBeTruthy()
  })

  // Green before this change — Task 11 added the branch when it stubbed the union member. Kept
  // because the numbering above must not regress it, not as evidence of anything new.
  it('names an assembly sheet as an assembly', () => {
    const cabinetSheets = buildDrawingSheets([makeBoard()], 'Job', [
      { cabinet, parts: partsOfBase600(), byId, materials: PRESET_MATERIALS },
    ])
    render(<DrawingViewer open onClose={vi.fn()} sheets={cabinetSheets} projectName="Job" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/Assembly — Base 600/)).toBeTruthy()
  })

  // An assembly sheet has no partLabel, so it is named after the cabinet it draws. The same
  // function names the file the cabinet editor's own buttons download.
  it('downloads an assembly sheet under its cabinet’s name', () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    const cabinetSheets = buildDrawingSheets([makeBoard()], 'Job', [
      { cabinet, parts: partsOfBase600(), byId, materials: PRESET_MATERIALS },
    ])
    render(<DrawingViewer open onClose={vi.fn()} sheets={cabinetSheets} projectName="Job" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    fireEvent.click(screen.getByRole('button', { name: /Download SVG/ }))
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      'job-base-600-assembly.svg',
      'image/svg+xml',
    )
  })

  it('renders a dowel part sheet and downloads with its label (viewer is shape-agnostic)', () => {
    const dowelSheets = buildDrawingSheets([makeDowel({ id: 'd1', label: 'Pin' })], 'Kit')
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={dowelSheets} projectName="Kit" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/Part 1 of 1 — Pin/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Download SVG/ }))
    expect(spy).toHaveBeenCalledWith(expect.any(String), 'kit-pin.svg', 'image/svg+xml')
  })
})
