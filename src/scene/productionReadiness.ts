import type { Scene, Selection } from './types'
import { componentsById } from './componentTree'
import { validateCarcaseParams } from './carcaseValidation'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { buildJointChecklist, jointPairIds } from './jointChecklist'
import { suggestJointsForScene } from './suggestJoints'
import { productionLimitIssue } from './readinessLimits'
import type { Section } from './sectionTree'

export interface ProductionFinding {
  kind: 'geometry' | 'material' | 'missing' | 'joinery' | 'unassessed'
  message: string
  targets: { label: string; selection: Extract<Selection, { kind: 'part' | 'component' }> }[]
}
export interface ProductionReadiness {
  findings: ProductionFinding[]
  intentionalContacts: number | null
  joineryComplete: boolean
}
const pairKey = (ids: string[]) => [...ids].sort().join('|')
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown assessment error'

// Conservative preflight before the generator's per-board machining passes. A leaf may include
// fronts, frame members and a five-board drawer; an adjustable shelf cannot outnumber its pins.
function estimatedBoards(section: Section): number {
  if (section.content.kind === 'split')
    return 4 + section.content.children.reduce((n, c) => n + estimatedBoards(c), 0)
  const spec = section.interior
  return (
    12 +
    (spec?.fixedShelves ?? 0) +
    Math.min(spec?.adjustable.shelves ?? 0, spec?.adjustable.count ?? 0)
  )
}

export function buildProductionReadiness(scene: Scene): ProductionReadiness {
  const findings: ProductionFinding[] = []
  let incompleteGeometry = false
  const componentTarget = (id: string) => ({
    label: scene.components.find((c) => c.id === id)?.label ?? id,
    selection: { kind: 'component' as const, id },
  })
  const partTarget = (id: string) => ({
    label: scene.parts.find((p) => p.id === id)?.label ?? id,
    selection: { kind: 'part' as const, id },
  })
  const add = (
    kind: ProductionFinding['kind'],
    message: string,
    targets: ProductionFinding['targets'],
  ) => findings.push({ kind, message, targets })
  const actualPairs = new Set(scene.joints.map((j) => pairKey(jointPairIds(j))))
  const missingJointPairs = new Set<string>()
  for (const joint of scene.joints) {
    const ids = jointPairIds(joint)
    if (ids.some((id) => !scene.parts.some((p) => p.id === id)))
      add(
        'joinery',
        `Joint ${joint.label} references a missing part.`,
        ids.filter((id) => scene.parts.some((p) => p.id === id)).map(partTarget),
      )
  }

  for (const c of scene.components) {
    if (
      (c.kind === 'drawer' || c.kind === 'faceFrame') &&
      !scene.components.some((p) => p.id === c.parentId && p.kind === 'carcase')
    )
      add(
        'unassessed',
        `${c.label} has no owning cabinet; generated-part completeness was not assessed.`,
        [componentTarget(c.id)],
      )
  }

  for (const cabinet of scene.components) {
    if (cabinet.kind !== 'carcase') continue
    const target = [componentTarget(cabinet.id)]
    try {
      const limit = productionLimitIssue(cabinet)
      if (limit) {
        add('unassessed', limit, target)
        incompleteGeometry = true
        continue
      }
      if (estimatedBoards(cabinet.params.section) > 200) {
        add(
          'unassessed',
          'Generated-part checks skipped: estimated generated-part complexity exceeds the report budget.',
          target,
        )
        incompleteGeometry = true
        continue
      }
      const errors = validateCarcaseParams(
        cabinet.params,
        roleThicknessFor(cabinet.params, scene.materials, overridesOf(scene.parts, cabinet.id)),
      )
      if (errors.length) {
        errors.forEach((e) => add('geometry', e, target))
        add(
          'unassessed',
          'Generated-part checks skipped because cabinet parameters cannot be resolved.',
          target,
        )
        incompleteGeometry = true
        continue
      }
      const owned = scene.components.filter(
        (c) =>
          c.id === cabinet.id ||
          ((c.kind === 'drawer' || c.kind === 'faceFrame') && c.parentId === cabinet.id),
      )
      const ids = new Set(owned.map((c) => c.id))
      if (scene.parts.filter((p) => p.parentId !== null && ids.has(p.parentId)).length > 200) {
        add(
          'unassessed',
          'Generated-part checks skipped: this cabinet exceeds the report limit of 200 existing parts.',
          target,
        )
        incompleteGeometry = true
        continue
      }
      // A disposable expectation, never applied to the scene. Force role-bound boards through
      // generation so a stale or non-board occupant cannot hide an expected board.
      const input: Scene = {
        ...scene,
        components: [...scene.components.filter((c) => c.kind === 'group'), ...owned],
        parts: scene.parts
          .filter((p) => p.parentId !== null && ids.has(p.parentId))
          .map((p) => (p.role ? { ...p, driven: true } : p)),
      }
      const expected = regenerateComponents(regenerateDrawers(regenerateFaceFrames(input)))
      for (const c of expected.components) {
        if (c.kind !== 'drawer' && c.kind !== 'faceFrame') continue
        if (!scene.components.some((actual) => actual.id === c.id)) {
          add(
            'missing',
            `Missing generated ${c.kind === 'drawer' ? 'drawer assembly' : 'face frame'}.`,
            target,
          )
        } else if (!c.driven) {
          add('unassessed', `Detached ${c.label}: generated-part completeness was not assessed.`, [
            componentTarget(c.id),
          ])
        } else if (!expected.parts.some((p) => p.parentId === c.id && p.driven)) {
          add(
            'unassessed',
            `${c.label} produced no boards; its configuration could not be assessed.`,
            [componentTarget(c.id)],
          )
          incompleteGeometry = true
        }
      }
      for (const p of expected.parts) {
        if (p.kind !== 'board' || !p.driven || !p.role || p.parentId === null) continue
        if (!ids.has(p.parentId)) continue // missing assembly is reported once, at its cabinet
        const actual = scene.parts.filter(
          (a) => a.parentId === p.parentId && a.role === p.role && a.kind === 'board',
        )
        if (!actual.length)
          add('missing', `Missing generated part: ${p.label} (${p.role}).`, [
            componentTarget(p.parentId),
          ])
        if (actual.length > 1)
          add(
            'missing',
            `Duplicate generated role: ${p.role}.`,
            actual.map((a) => partTarget(a.id)),
          )
        if (![p.length, p.width, p.thickness].every((n) => Number.isFinite(n) && n > 0)) {
          add('geometry', `Generated dimensions are invalid for ${p.label}.`, target)
          incompleteGeometry = true
        }
      }
      // Required generated joints must be checked even if their actual boards have moved apart.
      for (const joint of expected.joints.filter((j) => j.sourceComponentId === cabinet.id)) {
        const pair = jointPairIds(joint)
        if (!pair.every((id) => scene.parts.some((p) => p.id === id))) continue
        const key = pairKey(pair)
        if (!actualPairs.has(key) && !missingJointPairs.has(key)) {
          missingJointPairs.add(key)
          add('joinery', 'Missing cabinet joint between these parts.', pair.map(partTarget))
        }
      }
    } catch (error) {
      incompleteGeometry = true
      add('unassessed', `Cabinet checks could not complete: ${errorText(error)}`, target)
    }
  }

  for (const part of scene.parts) {
    if (part.kind !== 'board') continue
    if (![part.length, part.width, part.thickness].every((n) => Number.isFinite(n) && n > 0)) {
      add('geometry', 'Board dimensions must be finite and positive.', [partTarget(part.id)])
      incompleteGeometry = true
    }
    if (
      ![...Object.values(part.position), ...Object.values(part.rotation)].every(Number.isFinite)
    ) {
      add('geometry', 'Board position and rotation must be finite.', [partTarget(part.id)])
      incompleteGeometry = true
    }
    const thickness =
      part.overrides?.thickness ??
      scene.materials[part.overrides?.material ?? part.material]?.thickness
    if (!Number.isFinite(thickness) || thickness! <= 0)
      add(
        'material',
        'Material thickness is unresolved or invalid; confirm the material or explicit thickness override.',
        [partTarget(part.id)],
      )
  }

  let intentionalContacts: number | null = null
  let joineryComplete = false
  if (incompleteGeometry || scene.parts.filter((p) => p.kind === 'board').length > 200) {
    add(
      'unassessed',
      'Scene joinery scan skipped: resolve geometry issues or reduce the scene to at most 200 boards.',
      [],
    )
  } else {
    try {
      // Visibility is a viewing preference, not an exclusion from this production report.
      const parts = scene.parts.map((p) => ({ ...p, visible: true }))
      const byId = componentsById(scene.components.map((c) => ({ ...c, visible: true })))
      const checklist = buildJointChecklist(
        parts,
        scene.joints,
        suggestJointsForScene(parts, scene.joints, byId),
        byId,
        scene.materials,
      )
      intentionalContacts = checklist.contact.length
      for (const row of [
        ...checklist.rows,
        ...checklist.groups.flatMap((g) => g.rows),
        ...checklist.unresolved,
      ]) {
        if (row.state !== 'open' && row.state !== 'no-offer') continue
        if (missingJointPairs.has(pairKey([row.aId, row.bId]))) continue
        add(
          'joinery',
          row.state === 'open'
            ? 'Unresolved joinery: joint options are available for this pair.'
            : 'Touching parts have no supported joint option; review their connection.',
          [partTarget(row.aId), partTarget(row.bId)],
        )
      }
      joineryComplete = !checklist.truncated
      if (checklist.truncated)
        add(
          'unassessed',
          'Joinery results exceeded the checklist display limit; additional pairs were not listed.',
          [],
        )
    } catch (error) {
      add('unassessed', `Scene joinery scan could not complete: ${errorText(error)}`, [])
    }
  }
  return { findings, intentionalContacts, joineryComplete }
}
