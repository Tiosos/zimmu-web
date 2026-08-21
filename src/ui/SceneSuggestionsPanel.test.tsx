import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { DadoJoint, PartId, Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { SceneSuggestionsPanel } from './SceneSuggestionsPanel'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import { regenerateComponents } from '../scene/regenerateComponents'

afterEach(cleanup)

const base = {
  kind: 'board' as const,
  length: 100,
  width: 40,
  thickness: 18,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ' as const,
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}

// All three boards sit at the origin, so every pair touches. That is what lets these fixtures drive
// row state purely from the suggestions and joints handed in.
function scene(): Scene {
  return {
    parts: [
      { ...base, id: 'A', label: 'Left Side' },
      { ...base, id: 'B', label: 'Bottom' },
      { ...base, id: 'C', label: 'Top' },
    ],
    materials: {},
    components: [],
    hardware: [],
    joints: [],
  }
}

const dado = (housing: string, housed: string): JointSuggestion => ({
  kind: 'dado',
  neighborId: housed,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
})

const mortiseTenon = (mortise: string, tenon: string): JointSuggestion => ({
  kind: 'mortise-tenon',
  neighborId: tenon,
  mortisePartId: mortise,
  mortiseFace: '+Z',
  tenonPartId: tenon,
  tenonEnd: '-X',
})

const dadoJoint = (housing: PartId, housed: PartId): DadoJoint => ({
  kind: 'dado',
  id: 'joint_1',
  label: 'Dado 1',
  driven: false,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
  offset: 0,
  depth: 6,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 9,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
})

function jointedScene(): Scene {
  return { ...scene(), joints: [dadoJoint('A', 'B')] }
}

// Interleaved on purpose — the ordering suggestJointsForScene actually produces.
const interleaved = [dado('A', 'B'), dado('A', 'C'), mortiseTenon('A', 'B'), mortiseTenon('A', 'C')]

function panel(props: Partial<Parameters<typeof SceneSuggestionsPanel>[0]> = {}) {
  return render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
      {...props}
    />,
  )
}

const expand = () => fireEvent.click(screen.getByText(/Joints —/))

test('renders one row per pair, not one per suggestion', () => {
  panel()
  expand()
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
  expect(screen.getByText('Left Side + Top')).toBeTruthy()
})

test('the header counts jointed against actionable', () => {
  panel()
  expect(screen.getByText(/Joints — 0 \/ 2/)).toBeTruthy()
})

test('clicking a chip applies that exact suggestion', () => {
  const onApply = vi.fn()
  panel({ onApply })
  expand()
  fireEvent.click(screen.getAllByRole('button', { name: 'M&T' })[0])
  expect(onApply).toHaveBeenCalledWith(interleaved[2])
})

test('hovering a chip reports that exact suggestion, and leaving clears it', () => {
  const onHoverSuggestion = vi.fn()
  panel({ onHoverSuggestion })
  expand()
  // Deliberately an M&T chip, which is the second option in its group — a dado precedes it. A bug
  // that reported group.options[0] instead of the hovered suggestion would report that dado, so
  // hovering options[0] (a Dado chip, where s and options[0] coincide) could not catch it.
  const chip = screen.getAllByRole('button', { name: 'M&T' })[0]
  fireEvent.mouseEnter(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(interleaved[2])
  fireEvent.mouseLeave(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(null)
})

// Nothing to say means nothing rendered — but "no suggestions" alone no longer means that, since a
// touching pair with no offer is now a row in its own right. Only a scene with no touching pairs
// at all is empty.
test('renders nothing when no pair touches', () => {
  const apart: Scene = {
    ...scene(),
    parts: [
      { ...base, id: 'A', label: 'Left Side' },
      { ...base, id: 'B', label: 'Bottom', position: { x: 5000, y: 0, z: 0 } },
    ],
  }
  const { container } = panel({ suggestions: [], scene: apart })
  expect(container.textContent).toBe('')
})

const finger = (a: string, b: string): JointSuggestion => ({
  kind: 'finger',
  neighborId: b,
  partAId: a,
  endA: '+X',
  partBId: b,
  endB: '-X',
})

test('an arrow appears only on a kind duplicated within the pair', () => {
  panel({ suggestions: [dado('A', 'B'), finger('A', 'B'), finger('B', 'A')] })
  expand()
  expect(screen.getByRole('button', { name: 'Dado' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Finger →' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Finger ←' })).toBeTruthy()
})

test('a chip carries the long description as its tooltip', () => {
  panel({ suggestions: [dado('A', 'B'), finger('A', 'B'), finger('B', 'A')] })
  expand()
  expect(screen.getByRole('button', { name: 'Finger →' }).getAttribute('title')).toBe(
    'Finger joint — Left Side leads, Bottom seats',
  )
})

test('a jointed pair renders a tick and its kind, with no chips', () => {
  panel({ suggestions: [], scene: jointedScene() })
  expand()
  expect(screen.getByText(/✓ Left Side \+ Bottom/)).toBeTruthy()
  expect(screen.getByText('Dado')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Dado' })).toBeNull()
})

test('the counter reads jointed over actionable', () => {
  panel({ suggestions: [dado('A', 'C')], scene: jointedScene() })
  expect(screen.getByText(/Joints — 1 \/ 2/)).toBeTruthy()
})

test('hovering a jointed row reports the pair, and leaving clears it', () => {
  const onHoverPair = vi.fn()
  panel({ suggestions: [], scene: jointedScene(), onHoverPair })
  expand()
  const row = screen.getByText(/✓ Left Side \+ Bottom/).parentElement!
  fireEvent.mouseEnter(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(['A', 'B'])
  fireEvent.mouseLeave(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(null)
})

// Undo the joint with the pointer still on its row and the row flips to open underneath it. If the
// leave handler were conditioned on state it would be gone by then, stranding both boards tinted
// with nothing left to clear them.
test('leaving a row that flipped to open still clears the pair', () => {
  const onHoverPair = vi.fn()
  const { rerender } = panel({ suggestions: [], scene: jointedScene(), onHoverPair })
  expand()
  fireEvent.mouseEnter(screen.getByText(/✓ Left Side \+ Bottom/).parentElement!)
  expect(onHoverPair).toHaveBeenLastCalledWith(['A', 'B'])
  rerender(
    <SceneSuggestionsPanel
      suggestions={[dado('A', 'B')]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={onHoverPair}
    />,
  )
  fireEvent.mouseLeave(screen.getByText('Left Side + Bottom').parentElement!)
  expect(onHoverPair).toHaveBeenLastCalledWith(null)
})

// The no-offer group is muted, uncounted and closed by default: on a carcase it is noise most of
// the time, and inlining it would re-inflate the row count grouping brought down from 40 to 14.
test('no-offer pairs live in their own section, closed by default', () => {
  panel({ suggestions: [] })
  expand()
  expect(screen.getByText(/No joint available \(3\)/)).toBeTruthy()
  expect(screen.queryByText('Left Side + Bottom')).toBeNull()
  fireEvent.click(screen.getByText(/No joint available/))
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
})

// A generated cabinet, not a hand-built fixture: the 12 / 12 in the header is the real generator's
// joint count, and the two contact pairs it declares are what keep it from reading 12 / 14.
function cabinetScene(): Scene {
  return regenerateComponents({
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [
      {
        kind: 'carcase',
        id: 'cmp_1',
        label: 'Base 600',
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        params: CARCASE_PRESETS[0].params,
      },
    ],
  })
}

test('a fully jointed cabinet renders as one collapsed group line', () => {
  panel({ suggestions: [], scene: cabinetScene() })
  expect(screen.getByText(/Joints — 12 \/ 12/)).toBeTruthy()
  expand()
  expect(screen.getByText(/✓ Base 600 — 12 \/ 12/)).toBeTruthy()
  expect(screen.queryByText(/Left Side \+ Bottom/)).toBeNull()
  fireEvent.click(screen.getByText(/Base 600 — 12 \/ 12/))
  expect(screen.getByText(/✓ Left Side \+ Bottom/)).toBeTruthy()
})

test('contact pairs are listed as needing no joint, not as unavailable', () => {
  panel({ suggestions: [], scene: cabinetScene() })
  expand()
  expect(screen.getByText(/No joint needed \(2\)/)).toBeTruthy()
  fireEvent.click(screen.getByText(/No joint needed/))
  expect(screen.getByText('Bottom + Toe Kick')).toBeTruthy()
})
