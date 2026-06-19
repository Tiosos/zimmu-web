import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DrawingViewer } from './DrawingViewer'
import { buildDrawingSheets } from '../geom/drawing'
import * as downloadModule from './download'
import type { BoardPart } from '../scene/types'

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
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

const sheets = buildDrawingSheets(
  [makeBoard({ id: 'p1', label: 'Top' }), makeBoard({ id: 'p2', label: 'Side' })],
  'Cabinet',
)

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
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.svg$/),
      'image/svg+xml',
    )
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
})
