import type { BoardPart } from '../scene/types'
import { grainMatchBindingError, type GrainMatchBinding } from '../scene/grainMatchRecipe'
import { occupancyMask } from './mask'
import {
  allowedRotations,
  nestSheets,
  type NestResult,
  type SheetSpec,
  type Rotation,
  type MatchBlankPlacement,
  type NestItem,
} from './nest'
export type NestBoard = Pick<
  BoardPart,
  'kind' | 'id' | 'length' | 'width' | 'thickness' | 'grain' | 'cuts' | 'grainMatch'
>
export interface NestJob {
  parts: NestBoard[]
  clearance: number
  sheet: SheetSpec
  hasGrain: boolean
}
export function matchedRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
  r: Rotation,
) {
  return r === 0
    ? { x, y, w, h }
    : r === 90
      ? { x: H - y - h, y: x, w: h, h: w }
      : r === 180
        ? { x: W - x - w, y: H - y - h, w, h }
        : { x: y, y: W - x - w, w: h, h: w }
}
export function matchedGroupProblem(
  members: NestBoard[],
  clearance: number,
  sheet: SheetSpec,
  hasGrain: boolean,
): string | null {
  if (!members.length || members.some((p) => !p.grainMatch))
    return 'The complete matched group is not available for this nesting job.'
  if (!Number.isFinite(clearance) || clearance < 0 || clearance > 1000)
    return 'Tool clearance must be a finite number from 0 to 1000 mm.'
  if (![sheet.length, sheet.width].every((n) => Number.isFinite(n) && n > 0))
    return 'Choose positive finite sheet stock dimensions.'
  const b = members[0].grainMatch!
  let problem =
    members.map((p) => grainMatchBindingError(p.grainMatch)).find(Boolean) ??
    members.map((p) => p.grainMatch!.problem).find(Boolean) ??
    null
  if (
    !problem &&
    (members.length !== b.memberCount ||
      new Set(members.map((p) => p.id)).size !== members.length ||
      new Set(members.map((p) => p.grainMatch!.sequence)).size !== members.length)
  )
    problem = 'The complete matched group is not available for this nesting job.'
  if (
    !problem &&
    members.some((p) => {
      const g = p.grainMatch!
      return (
        g.blankWidth !== b.blankWidth ||
        g.blankHeight !== b.blankHeight ||
        g.direction !== b.direction ||
        g.memberCount !== b.memberCount ||
        g.label !== b.label ||
        g.patternX !== b.patternX ||
        g.patternY !== b.patternY ||
        p.thickness !== members[0].thickness ||
        p.grain !== (g.direction === 'vertical' ? 'length' : 'width') ||
        Math.abs(g.width - p.width) > 0.00001 ||
        Math.abs(g.height - p.length) > 0.00001
      )
    })
  )
    problem = 'Matched front dimensions or group metadata disagree.'
  const gap = 2 * Math.ceil(Math.max(0, clearance) / 2)
  if (!problem)
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i].grainMatch!,
          c = members[j].grainMatch!
        const dx = Math.max(c.x - a.x - a.width, a.x - c.x - c.width),
          dy = Math.max(c.y - a.y - a.height, a.y - c.y - c.height)
        if (dx < gap - 0.00001 && dy < gap - 0.00001)
          problem =
            'Matched panel cutting gaps are smaller than tool clearance. Increase the group cutting gap or reduce tool clearance.'
      }
  const grain = b.direction === 'horizontal' ? 'length' : 'width',
    W = Math.ceil(b.blankWidth),
    H = Math.ceil(b.blankHeight)
  const pad = Math.ceil(Math.max(0, clearance) / 2)
  if (
    !problem &&
    !allowedRotations(grain, hasGrain).some(
      (r) =>
        (r === 0 || r === 180 ? W + 2 * pad : H + 2 * pad) <= sheet.length &&
        (r === 0 || r === 180 ? H + 2 * pad : W + 2 * pad) <= sheet.width,
    )
  )
    problem = 'The complete matched blank does not fit this sheet stock with tool clearance.'
  return problem ?? null
}
export function nestJob({ parts, clearance, sheet, hasGrain }: NestJob): NestResult {
  if (!parts.some((p) => p.grainMatch))
    return nestSheets(
      parts.map((p) => ({ id: p.id, mask: occupancyMask(p, clearance), grain: p.grain })),
      sheet,
      { hasGrain },
    )
  const groups = new Map<string, NestBoard[]>(),
    plain = parts.filter((p) => !p.grainMatch),
    matched = new Map<string, { members: NestBoard[]; binding: GrainMatchBinding }>(),
    unplaced: string[] = [],
    problems: NonNullable<NestResult['matchProblems']> = []
  for (const p of parts)
    if (p.grainMatch) {
      const id = p.grainMatch.groupId
      groups.set(id, [...(groups.get(id) ?? []), p])
    }
  const items: NestItem[] = plain.map((p) => ({
    id: p.id,
    mask: occupancyMask(p, clearance),
    grain: p.grain,
  }))
  for (const [groupId, members] of groups) {
    const b = members[0].grainMatch!,
      problem = matchedGroupProblem(members, clearance, sheet, hasGrain)
    const grain = b.direction === 'horizontal' ? 'length' : 'width',
      W = Math.ceil(b.blankWidth),
      H = Math.ceil(b.blankHeight)
    if (problem) {
      unplaced.push(...members.map((p) => p.id))
      problems.push({ groupId, message: problem, memberIds: members.map((p) => p.id) })
      continue
    }
    let id = `grain-blank:${groupId}`
    while (parts.some((p) => p.id === id) || matched.has(id)) id += ':'
    matched.set(id, {
      members: [...members].sort(
        (a, b) => a.grainMatch!.sequence - b.grainMatch!.sequence || a.id.localeCompare(b.id),
      ),
      binding: b,
    })
    items.push({
      id,
      grain,
      mask: occupancyMask(
        { kind: 'board', length: W, width: H, thickness: members[0].thickness, cuts: [] },
        clearance,
      ),
    })
  }
  const nested = nestSheets(items, sheet, { hasGrain }),
    blanks: MatchBlankPlacement[] = []
  const sheets = nested.sheets.map((placements) =>
    placements.flatMap((p) => {
      const match = matched.get(p.id)
      if (!match) return [p]
      const b = match.binding,
        W = Math.ceil(b.blankWidth),
        H = Math.ceil(b.blankHeight)
      blanks.push({
        groupId: b.groupId,
        label: b.label,
        sheet: p.sheet,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        rotation: p.rotation,
      })
      return match.members.map((member) => {
        const g = member.grainMatch!,
          at = matchedRectangle(g.x, g.y, g.width, g.height, W, H, p.rotation)
        return {
          id: member.id,
          sheet: p.sheet,
          rotation: ((270 + p.rotation) % 360) as Rotation,
          x: p.x + at.x,
          y: p.y + at.y,
          w: at.w,
          h: at.h,
          grainMatch: { groupId: g.groupId, label: g.label, sequence: g.sequence },
        }
      })
    }),
  )
  for (const id of nested.unplaced) {
    const group = matched.get(id)
    if (group) {
      unplaced.push(...group.members.map((p) => p.id))
      problems.push({
        groupId: group.binding.groupId,
        message: 'The matched blank could not be placed.',
        memberIds: group.members.map((p) => p.id),
      })
    } else unplaced.push(id)
  }
  return {
    sheets,
    utilisation: sheets.map(
      (s) => s.reduce((sum, p) => sum + p.w * p.h, 0) / (sheet.length * sheet.width),
    ),
    unplaced: [...new Set(unplaced)].sort(),
    ...(blanks.length ? { blanks } : {}),
    ...(problems.length ? { matchProblems: problems } : {}),
  }
}
