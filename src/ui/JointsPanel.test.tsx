import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JointsPanel } from './JointsPanel'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { defaultFingerJoint } from '../scene/defaultJoint'
import { reconcileJoints } from '../scene/reconcileJoints'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { BoardPart, CarcaseComponent, Joint, Part, Scene } from '../scene/types'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const scene: Scene = reconcileJoints(
  regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }),
)
const SIDE_BOTTOM = 'joint_cmp_1_left-side__bottom'
const screw = scene.joints.find((j) => j.id === SIDE_BOTTOM)!
const partOf = (role: string): Part => scene.parts.find((p) => p.role === role)!

function renderFor(part: Part, over: Partial<Scene> = {}) {
  const onUpdateJoint = vi.fn()
  render(
    <JointsPanel
      part={part}
      scene={{ ...scene, ...over }}
      onUpdateJoint={onUpdateJoint}
      onRemoveJoint={vi.fn()}
    />,
  )
  return onUpdateJoint
}

// The joint block is the div wrapping the label row, so a panel showing several joints is narrowed
// to the one under test rather than reaching for the first combobox on screen.
function blockOf(joint: Joint): HTMLElement {
  return screen.getByText(joint.label).closest('div')!.parentElement!
}

afterEach(cleanup)

describe('changing a joint kind', () => {
  it('offers the kinds the pairing admits, and no others', async () => {
    renderFor(partOf('left-side'))
    await userEvent.click(within(blockOf(screw)).getAllByRole('combobox')[0])

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Dado',
      'Screw fixing',
    ])
  })

  it('rebuilds the joint as the chosen kind, keeping its id', async () => {
    const onUpdateJoint = renderFor(partOf('left-side'))
    await userEvent.click(within(blockOf(screw)).getAllByRole('combobox')[0])
    await userEvent.click(screen.getByRole('option', { name: 'Dado' }))

    expect(onUpdateJoint).toHaveBeenCalledWith(SIDE_BOTTOM, expect.any(Function))
    const updater = onUpdateJoint.mock.calls.at(-1)![1] as (j: Joint) => Joint
    const next = updater(screw)
    expect(next.kind).toBe('dado')
    expect(next.id).toBe(SIDE_BOTTOM)
    expect(next.driven).toBe(false)
  })

  it('offers nothing on a joint whose kind cannot be changed', () => {
    const finger = defaultFingerJoint(
      partOf('left-side') as BoardPart,
      partOf('bottom') as BoardPart,
      '-Y',
      '-X',
      'j_finger',
      'Finger joint 1',
    )
    renderFor(partOf('left-side'), { joints: [finger] })

    expect(screen.getByText('Finger joint 1')).toBeTruthy()
    expect(screen.queryByText('Kind')).toBeNull()
  })
})
