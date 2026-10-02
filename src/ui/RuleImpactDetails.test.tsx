import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RuleImpactDetails } from './RuleImpactDetails'
import { CabinetRulesPanel } from './CabinetRulesPanel'
import { ProjectPanel } from './ProjectPanel'
import { CabinetEditor } from './CabinetEditor'
import { DEFAULT_CABINET_RULES } from '../scene/constructionRules'
import { previewProjectRules } from '../scene/ruleFlow'
import { CABINET_CATALOGUE } from '../scene/catalogue'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { applyPipeline } from '../scene/pipeline'
import { defaultProject } from '../scene/projectStructure'
import { HARDWARE_CATALOGUE } from '../scene/hardwareCatalogue'
import type { Scene, CarcaseComponent, HardwareLibraryEntry } from '../scene/types'
const d = CABINET_CATALOGUE[0]
const c: CarcaseComponent = {
  kind: 'carcase',
  id: 'cabinet',
  label: d.name,
  params: d.params,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  catalogue: { id: d.catalogueId, version: 1, overrides: {} },
}
const scene: Scene = applyPipeline({
  parts: [],
  components: [c],
  joints: [],
  hardware: [],
  materials: PRESET_MATERIALS,
})
const library = Object.fromEntries(
  Object.keys(scene.materials).map((key) => [key, { costPerM2: 10 }]),
)
const hardwareLibrary: Record<string, HardwareLibraryEntry> = Object.fromEntries(
  Object.keys(HARDWARE_CATALOGUE).map((key) => [
    key,
    { unitCost: 1, partNumber: '', supplier: '' },
  ]),
)
afterEach(cleanup)
it('shows exact before/after operation details and incomplete price coverage without applying', () => {
  const preview = previewProjectRules(scene, {
    ...DEFAULT_CABINET_RULES,
    project: { frontReveal: 5 },
  })
  const source = preview.source
  render(<RuleImpactDetails preview={preview} />)
  expect(screen.getByText(/Total cost change unavailable/)).toBeTruthy()
  expect(screen.getByText('Missing rates or unusable quantities')).toBeTruthy()
  expect(screen.getByText(/Whole-project comparison/)).toBeTruthy()
  expect(screen.getByText(/^Part and operation changes/)).toBeTruthy()
  const impact = screen.getByRole('region', { name: 'Update manufacturing impact' })
  expect(within(impact).getAllByText(/Depth \(mm\):/).length).toBeGreaterThan(0)
  expect(within(impact).getAllByText(/^Part ID:/).length).toBeGreaterThan(0)
  expect(preview.source).toBe(source)
  expect(screen.queryByRole('button')).toBeNull()
})
it('reprices both captured versions when library rates change and hides invalid preview details', () => {
  const preview = previewProjectRules(scene, {
    ...DEFAULT_CABINET_RULES,
    project: { frontReveal: 5 },
  })
  const view = render(
    <RuleImpactDetails preview={preview} library={library} hardwareLibrary={hardwareLibrary} />,
  )
  const first = screen.getByText(/^Estimated purchased material/).textContent
  expect(screen.getByText(/^Estimated cost change:/)).toBeTruthy()
  view.rerender(
    <RuleImpactDetails
      preview={preview}
      library={Object.fromEntries(Object.keys(library).map((k) => [k, { costPerM2: 20 }]))}
      hardwareLibrary={hardwareLibrary}
    />,
  )
  expect(screen.getByText(/^Estimated purchased material/).textContent).not.toBe(first)
  view.rerender(<RuleImpactDetails preview={{ ...preview, errors: ['blocked'] }} />)
  expect(screen.queryByRole('region', { name: 'Update manufacturing impact' })).toBeNull()
})
it('project rule preview uses both libraries and retains explicit acceptance', () => {
  const onApply = vi.fn().mockReturnValue(true)
  render(
    <CabinetRulesPanel
      scene={scene}
      onApply={onApply}
      library={library}
      hardwareLibrary={hardwareLibrary}
    />,
  )
  fireEvent.change(screen.getByLabelText('Project Front reveal mm'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview project rules' }))
  expect(screen.getByText(/^Estimated cost change:/)).toBeTruthy()
  expect(screen.queryByText('Missing rates or unusable quantities')).toBeNull()
  expect(onApply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply project rules' }))
  expect(onApply).toHaveBeenCalledOnce()
})
it('project structure forwards current libraries into its rule preview', () => {
  render(
    <ProjectPanel
      project={defaultProject(scene, 'Test')}
      scene={scene}
      projectName="Test"
      onChange={vi.fn()}
      activeItemId=""
      onSelectItem={vi.fn()}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onClose={vi.fn()}
      onApplyRulePreview={vi.fn()}
      library={library}
      hardwareLibrary={hardwareLibrary}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Preview project rules' }))
  expect(screen.getByText(/^Estimated cost change: \$0.00/)).toBeTruthy()
  expect(screen.queryByText('Missing rates or unusable quantities')).toBeNull()
})
it('catalogue preview uses current libraries and leaves the cabinet on its saved version', () => {
  const onApplyRulePreview = vi.fn()
  render(
    <CabinetEditor
      component={c}
      scene={scene}
      materials={scene.materials}
      tab="3d"
      onTabChange={vi.fn()}
      selectedSectionId={null}
      onSelectSection={vi.fn()}
      onUpdate={vi.fn()}
      parts={scene.parts}
      byId={new Map(scene.components.map((c) => [c.id, c]))}
      selectedPartId={null}
      onSelectPart={vi.fn()}
      projectName="Test"
      onApplyRulePreview={onApplyRulePreview}
      library={library}
      hardwareLibrary={hardwareLibrary}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Preview catalogue update' }))
  expect(screen.getByText(/^Estimated cost change: \$0.00/)).toBeTruthy()
  expect(screen.queryByText('Missing rates or unusable quantities')).toBeNull()
  expect(onApplyRulePreview).not.toHaveBeenCalled()
  expect(c.catalogue?.version).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close impact review' }))
  expect(screen.queryByRole('region', { name: 'Update manufacturing impact' })).toBeNull()
  expect(onApplyRulePreview).not.toHaveBeenCalled()
})
