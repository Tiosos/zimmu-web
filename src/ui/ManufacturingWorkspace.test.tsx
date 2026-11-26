import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ManufacturingWorkspaceProps } from './ManufacturingWorkspace'
import { ManufacturingWorkspace } from './ManufacturingWorkspace'
import {
  MANUFACTURING_EXPORTS,
  MANUFACTURING_WORKFLOWS,
} from './manufacturingWorkflowData'
import { manufacturingProject } from '../scene/__fixtures__/manufacturingProject'
import { defaultProject } from '../scene/projectStructure'

afterEach(() => cleanup())

const scene = manufacturingProject()
const project = defaultProject(scene)

function renderWorkspace(overrides: Partial<ManufacturingWorkspaceProps> = {}) {
  const callbacks = {
    onOpenBom: vi.fn(),
    onOpenReadiness: vi.fn(),
    onOpenDrawings: vi.fn(),
    onExportPacket: vi.fn(),
    onOpenComparison: vi.fn(),
    onOpenChangeReview: vi.fn(),
    onVerifyPacket: vi.fn(),
    onExportStl: vi.fn(),
    onExportStep: vi.fn(),
    onInspect: vi.fn(),
  }
  const props: ManufacturingWorkspaceProps = {
    scene,
    project,
    projectName: 'Kitchen job',
    materialLibrary: scene.materials,
    hardwareLibrary: {},
    releases: [],
    integrity: null,
    ...callbacks,
    ...overrides,
  }
  return { ...render(<ManufacturingWorkspace {...props} />), callbacks }
}

describe('manufacturingWorkflowData (S4 spec)', () => {
  it('contains the eight signed-off workflows in order and six export formats', () => {
    expect(MANUFACTURING_WORKFLOWS.map((card) => card.id)).toEqual([
      'cuttingList',
      'readiness',
      'drawings',
      'packet',
      'comparison',
      'changeReview',
      'verify',
      'exports',
    ])
    expect(new Set(MANUFACTURING_WORKFLOWS.map((card) => card.title)).size).toBe(8)
    expect(MANUFACTURING_EXPORTS).toHaveLength(6)
  })
})

describe('ManufacturingWorkspace (S4 shell)', () => {
  it('lists eight workflow cards and dispatches each to its real workflow', () => {
    const { callbacks } = renderWorkspace()
    const grid = screen.getByLabelText('Manufacturing workflow cards')
    expect(grid.querySelectorAll('button')).toHaveLength(8)
    for (const card of MANUFACTURING_WORKFLOWS) {
      expect(within(grid).getByText(card.title)).toBeTruthy()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Open Cutting List workflow' }))
    expect(callbacks.onOpenBom).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Readiness Review workflow' }))
    expect(callbacks.onOpenReadiness).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Shop Drawings workflow' }))
    expect(callbacks.onOpenDrawings).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Production Packet workflow' }))
    expect(callbacks.onExportPacket).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Release Comparison workflow' }))
    expect(callbacks.onOpenComparison).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Local Change Review workflow' }))
    expect(callbacks.onOpenChangeReview).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Verify Packet workflow' }))
    expect(callbacks.onVerifyPacket).toHaveBeenCalledTimes(1)
  })

  it('shows the live readiness classification with source references and locate actions', () => {
    const { callbacks } = renderWorkspace()
    const readiness = screen.getByLabelText('Readiness review summary')
    for (const label of ['corrections', 'advisories', 'unassessed']) {
      expect(within(readiness).getByText(new RegExp(label))).toBeTruthy()
    }
    const locate = within(readiness).queryByRole('button', { name: /Locate .* from readiness review/ })
    if (locate !== null) {
      fireEvent.click(locate)
      expect(callbacks.onInspect).toHaveBeenCalledTimes(1)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open full readiness review' }))
    expect(callbacks.onOpenReadiness).toHaveBeenCalledTimes(1)
    expect(within(readiness).getByText(/Exports remain available/)).toBeTruthy()
  })

  it('shows a drawing deck preview with real SVG and DXF downloads', () => {
    renderWorkspace()
    const drawings = screen.getByLabelText('Shop drawing deck')
    const sheets = within(drawings).getByLabelText('Drawing sheet list')
    expect(sheets.querySelectorAll('button').length).toBeGreaterThan(0)
    const preview = within(drawings).getByLabelText(/^Preview of /)
    expect(preview.querySelector('svg')).not.toBeNull()
    expect(within(drawings).getByRole('button', { name: 'Download sheet SVG' })).toBeTruthy()
    expect(within(drawings).getByRole('button', { name: 'Download sheet DXF' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open full drawing viewer' }))
  })

  it('reveals six export actions and invokes their real callbacks', () => {
    const { callbacks } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Open Exports workflow' }))
    const exports = screen.getByLabelText('Export formats')
    expect(exports.querySelectorAll('button')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Export STL mesh' }))
    expect(callbacks.onExportStl).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Export STEP solids' }))
    expect(callbacks.onExportStep).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Export Cutting CSV' }))
    expect(callbacks.onOpenBom).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Export Production ZIP' }))
    expect(callbacks.onExportPacket).toHaveBeenCalledTimes(1)
  })

  it('keeps verification separate from approval and opens the real verifier', () => {
    const { callbacks } = renderWorkspace()
    const packet = screen.getByLabelText('Production packet validation')
    expect(within(packet).getByText(/do not approve the design/)).toBeTruthy()
    expect(within(packet).getByText('No baseline')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify a downloaded packet' }))
    expect(callbacks.onVerifyPacket).toHaveBeenCalledTimes(1)
  })

  it('captures a source fingerprint bound to the current inputs', async () => {
    renderWorkspace()
    const packet = screen.getByLabelText('Production packet validation')
    await waitFor(
      () => {
        expect(within(packet).getByText(/^[0-9a-f]{16}…$/)).toBeTruthy()
      },
      { timeout: 3000 },
    )
  })
})
