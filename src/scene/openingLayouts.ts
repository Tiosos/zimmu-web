import type { DrawerComponent } from './types'
import { regenerateDrawers } from './regenerateDrawers'
import {
  carcaseRoles,
  frontGeometryOf,
  openingRect,
  sectionThickness,
  validateCarcaseParams,
} from './carcaseRoles'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { resolveSections, type ResolvedTree } from './sectionTree'
import type { ComponentId, MaterialDef, Part } from './types'
import { newSectionId, type FrontSpec, type Section, type SectionId } from './sectionTree'
import { defaultInterior } from './sectionInterior'
import type { CarcaseParams } from './types'

export const OPENING_LAYOUTS = [
  {
    id: 'shelves',
    label: 'Open shelving',
    description: 'One open bay with three adjustable shelves.',
  },
  {
    id: 'single-door',
    label: 'Single door',
    description: 'One left-hinged door and one adjustable shelf.',
  },
  {
    id: 'double-door',
    label: 'Double doors',
    description: 'A pair of doors and one adjustable shelf.',
  },
  {
    id: 'drawers',
    label: 'Three drawers',
    description: 'Three equal drawer fronts with generated drawer boxes.',
  },
  {
    id: 'drawer-door',
    label: 'Drawer above door',
    description: 'A 140 mm top drawer above a left-hinged door and one shelf.',
  },
] as const
export type OpeningLayoutId = (typeof OPENING_LAYOUTS)[number]['id']

export function findOpening(root: Section, id: SectionId): Section | null {
  if (root.id === id) return root
  if (root.content.kind === 'split') {
    for (const child of root.content.children) {
      const found = findOpening(child, id)
      if (found) return found
    }
  }
  return null
}

export function openingParent(root: Section, id: SectionId): Section | null {
  if (root.content.kind === 'leaf') return null
  for (const child of root.content.children) {
    if (child.id === id) return root
    const found = openingParent(child, id)
    if (found) return found
  }
  return null
}

export function replaceOpening(root: Section, id: SectionId, replacement: Section): Section {
  if (root.id === id) return replacement
  if (root.content.kind === 'leaf') return root
  const content = root.content
  const children = content.children.map((child) => replaceOpening(child, id, replacement))
  return children.every((child, i) => child === content.children[i])
    ? root
    : { ...root, content: { ...root.content, children } }
}

export function equalizeOpenings(root: Section, parentId: SectionId): Section {
  const parent = findOpening(root, parentId)
  if (!parent || parent.content.kind === 'leaf') return root
  if (parent.content.children.every((child) => child.size.kind === 'equal')) return root
  return replaceOpening(root, parentId, {
    ...parent,
    content: {
      ...parent.content,
      children: parent.content.children.map((child) => ({ ...child, size: { kind: 'equal' } })),
    },
  })
}

export function reorderOpening(root: Section, id: SectionId, direction: -1 | 1): Section {
  const parent = openingParent(root, id)
  if (!parent || parent.content.kind === 'leaf') return root
  const children = [...parent.content.children]
  const index = children.findIndex((child) => child.id === id)
  const destination = index + direction
  if (destination < 0 || destination >= children.length) return root
  ;[children[index], children[destination]] = [children[destination], children[index]]
  return replaceOpening(root, parent.id, { ...parent, content: { ...parent.content, children } })
}

export function reverseOpenings(root: Section, parentId: SectionId): Section {
  const parent = findOpening(root, parentId)
  if (!parent || parent.content.kind === 'leaf') return root
  return replaceOpening(root, parentId, {
    ...parent,
    content: { ...parent.content, children: [...parent.content.children].reverse() },
  })
}

export function openingLayout(
  params: CarcaseParams,
  id: SectionId,
  layout: OpeningLayoutId,
): CarcaseParams {
  const selected = findOpening(params.section, id)
  if (!selected) return params
  const child = (front: FrontSpec, shelves = 0): Section => ({
    id: newSectionId(),
    size: { kind: 'equal' },
    content: { kind: 'leaf' },
    front,
    ...(shelves > 0 ? { interior: defaultInterior(shelves) } : {}),
  })
  const door: FrontSpec = { kind: 'door', leaves: 1, hinge: 'left' }
  const replacement: Section = { id: selected.id, size: selected.size, content: { kind: 'leaf' } }
  if (layout === 'shelves') replacement.interior = defaultInterior(3)
  else if (layout === 'single-door' || layout === 'double-door') {
    replacement.front = layout === 'single-door' ? door : { ...door, leaves: 2 }
    replacement.interior = defaultInterior(1)
  } else {
    const children =
      layout === 'drawers'
        ? Array.from({ length: 3 }, () => child({ kind: 'drawer-front' }))
        : [
            child(door, 1),
            { ...child({ kind: 'drawer-front' }), size: { kind: 'fixed', mm: 140 } as const },
          ]
    replacement.content = { kind: 'split', axis: 'horizontal', division: 'none', children }
  }
  let frame = params.frame
  if (frame?.layout) {
    const removed = new Set<string>()
    const collect = (section: Section) => {
      removed.add(section.id)
      if (section.content.kind === 'split') section.content.children.forEach(collect)
    }
    collect(selected)
    const layout = Object.fromEntries(
      Object.entries(frame.layout).filter(([key]) => !removed.has(key)),
    )
    frame = { ...frame, layout: Object.keys(layout).length ? layout : undefined }
  }
  return {
    ...params,
    ...(frame ? { frame } : {}),
    section: replaceOpening(params.section, id, replacement),
  }
}

export function openingGeometry(
  params: CarcaseParams,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  componentId: ComponentId,
): { tree: ResolvedTree | null; errors: string[] } {
  const thickness = roleThicknessFor(params, materials, overridesOf(parts, componentId))
  try {
    const errors = validateCarcaseParams(params, thickness)
    if (errors.length) return { tree: null, errors }
    const roles = carcaseRoles(params, thickness, () => undefined)
    if (
      roles.some(({ panel }) =>
        [panel.length, panel.width, panel.thickness].some(
          (value) => !Number.isFinite(value) || value <= 0,
        ),
      )
    )
      return { tree: null, errors: ['The layout contains a panel with invalid dimensions.'] }
    const tree = resolveSections(
      params.section,
      openingRect(params, thickness),
      sectionThickness(thickness),
    )
    if (params.frame && !frontGeometryOf(params, tree).frameOpenings)
      return { tree: null, errors: ['The face frame cannot be generated for this layout.'] }
    return { tree, errors: [] }
  } catch (error) {
    return {
      tree: null,
      errors: [
        error instanceof Error ? error.message : 'The opening layout could not be resolved.',
      ],
    }
  }
}

export function openingLayoutErrors(
  params: CarcaseParams,
  selected: SectionId,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  componentId: ComponentId,
  existingDrawers: DrawerComponent[] = [],
): string[] {
  const geometry = openingGeometry(params, materials, parts, componentId)
  if (geometry.errors.length) return geometry.errors
  const section = findOpening(params.section, selected)
  if (!section) return ['The selected opening is no longer available.']
  const replacedIds = new Set<string>()
  const collect = (node: Section) => {
    replacedIds.add(node.id)
    if (node.content.kind === 'split') node.content.children.forEach(collect)
  }
  collect(section)
  // Use the real generator for fit; front rectangles alone cannot say whether a box or runner fits.
  const generated = regenerateDrawers({
    parts,
    materials,
    joints: [],
    hardware: [],
    components: [
      ...existingDrawers.filter((drawer) => drawer.parentId === componentId),
      {
        kind: 'carcase',
        id: componentId,
        label: 'Layout preview',
        params,
        parentId: null,
        visible: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
      },
    ],
  })
  const drawers = generated.components.filter(
    (component) =>
      component.kind === 'drawer' &&
      component.parentId === componentId &&
      component.sectionId !== null &&
      replacedIds.has(component.sectionId),
  )
  for (const drawer of drawers) {
    const roles = new Set(
      generated.parts.filter((part) => part.parentId === drawer.id).map((part) => part.role),
    )
    if (
      ['box-left', 'box-right', 'box-front', 'box-back', 'box-bottom'].some(
        (role) => !roles.has(role),
      )
    )
      return [
        'The new drawer boxes do not fit, or no supported runner fits the available depth. Increase the opening size or cabinet depth.',
      ]
  }
  return []
}
