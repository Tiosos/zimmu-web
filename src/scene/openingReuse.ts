import type { ResolvedTree } from './sectionTree'
import type { CarcaseParams, Section, SectionId } from './types'
import { freshSectionIds } from './sectionTree'
import { findOpening, openingParent, replaceOpening } from './openingLayouts'

export type PasteOpeningMode = 'layout' | 'front' | 'shelving'
export type OpeningCleanup = 'fronts' | 'shelving' | 'contents'

export function openingLeaves(root: Section): Section[] {
  return root.content.kind === 'leaf' ? [root] : root.content.children.flatMap(openingLeaves)
}

export function copyOpening(root: Section, id: SectionId): Section | null {
  const section = findOpening(root, id)
  return section ? structuredClone(section) : null
}

function mapOpening(root: Section, change: (node: Section) => Section): Section {
  let node = root
  if (root.content.kind === 'split') {
    const children = root.content.children.map((child) => mapOpening(child, change))
    if (
      children.some(
        (child, index) =>
          child !== (root.content.kind === 'split' ? root.content.children[index] : undefined),
      )
    )
      node = { ...root, content: { ...root.content, children } }
  }
  return change(node)
}

function install(
  params: CarcaseParams,
  id: SectionId,
  next: Section,
  clearFrame = false,
): CarcaseParams {
  const previous = findOpening(params.section, id)
  if (!previous) return params
  let frame = params.frame
  if (clearFrame && frame?.layout) {
    const ids = new Set<string>()
    mapOpening(previous, (node) => {
      ids.add(node.id)
      return node
    })
    const layout = Object.fromEntries(Object.entries(frame.layout).filter(([key]) => !ids.has(key)))
    if (Object.keys(layout).length !== Object.keys(frame.layout).length)
      frame = { ...frame, layout: Object.keys(layout).length ? layout : undefined }
  }
  if (next === previous && frame === params.frame) return params
  return {
    ...params,
    section: replaceOpening(params.section, id, next),
    ...(frame ? { frame } : {}),
  }
}

export function pasteOpening(
  params: CarcaseParams,
  id: SectionId,
  copied: Section,
  mode: PasteOpeningMode,
): CarcaseParams {
  const target = findOpening(params.section, id)
  if (
    !target ||
    (mode !== 'layout' && (target.content.kind !== 'leaf' || copied.content.kind !== 'leaf'))
  )
    return params
  if (mode === 'layout') {
    const next = freshSectionIds(structuredClone(copied))
    return install(params, id, { ...next, id: target.id, size: target.size }, true)
  }
  const next = { ...target }
  if (mode === 'front') {
    if (copied.front) next.front = { ...copied.front }
    else delete next.front
  } else {
    if (copied.interior) next.interior = structuredClone(copied.interior)
    else delete next.interior
  }
  return install(params, id, next, mode === 'front')
}

export function mirrorOpening(
  params: CarcaseParams,
  id: SectionId,
  axis: 'vertical' | 'horizontal',
): CarcaseParams {
  const target = findOpening(params.section, id)
  if (!target) return params
  const next = mapOpening(target, (node) => {
    if (
      !(axis === 'vertical' && node.front?.kind === 'door' && node.front.leaves === 1) &&
      !(node.content.kind === 'split' && node.content.axis === axis)
    )
      return node
    return {
      ...node,
      ...(axis === 'vertical' && node.front?.kind === 'door' && node.front.leaves === 1
        ? { front: { ...node.front, hinge: node.front.hinge === 'left' ? 'right' : 'left' } }
        : {}),
      content:
        node.content.kind === 'split' && node.content.axis === axis
          ? { ...node.content, children: [...node.content.children].reverse() }
          : node.content,
    }
  })
  return install(params, id, next, true)
}

export function clearOpening(
  params: CarcaseParams,
  id: SectionId,
  mode: OpeningCleanup,
): CarcaseParams {
  const target = findOpening(params.section, id)
  if (!target) return params
  return install(
    params,
    id,
    mapOpening(target, (node) => {
      if ((mode === 'shelving' || !node.front) && (mode === 'fronts' || !node.interior)) return node
      const next = { ...node }
      if (mode !== 'shelving') delete next.front
      if (mode !== 'fronts') delete next.interior
      return next
    }),
    mode !== 'shelving',
  )
}

export function repeatOpeningContents(
  params: CarcaseParams,
  id: SectionId,
  mode: 'front' | 'shelving',
): CarcaseParams {
  const source = findOpening(params.section, id)
  const parent = openingParent(params.section, id)
  if (
    !source ||
    source.content.kind !== 'leaf' ||
    parent?.content.kind !== 'split' ||
    parent.content.children.some((child) => child.content.kind !== 'leaf')
  )
    return params
  let next = params
  for (const child of parent.content.children)
    if (child.id !== id) next = pasteOpening(next, child.id, source, mode)
  return next
}

export function lockOpeningSizes(
  params: CarcaseParams,
  id: SectionId,
  tree: ResolvedTree,
): CarcaseParams {
  const section = findOpening(params.section, id)
  const group = section?.content.kind === 'split' ? section : openingParent(params.section, id)
  if (group?.content.kind !== 'split') return params
  const vertical = group.content.axis === 'vertical'
  const sizes = group.content.children.map((child) => {
    const rect = tree.rects.get(child.id)
    return rect ? (vertical ? rect.x1 - rect.x0 : rect.z1 - rect.z0) : NaN
  })
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) return params
  if (
    group.content.children.every(
      (child, index) => child.size.kind === 'fixed' && child.size.mm === sizes[index],
    )
  )
    return params
  return install(params, group.id, {
    ...group,
    content: {
      ...group.content,
      children: group.content.children.map((child, index) => ({
        ...child,
        size: { kind: 'fixed', mm: sizes[index] },
      })),
    },
  })
}

export function equalizeNestedOpenings(params: CarcaseParams, id: SectionId): CarcaseParams {
  const target = findOpening(params.section, id)
  if (!target || target.content.kind !== 'split') return params
  return install(
    params,
    id,
    mapOpening(target, (node) =>
      node.id === id || node.size.kind === 'equal' ? node : { ...node, size: { kind: 'equal' } },
    ),
  )
}
