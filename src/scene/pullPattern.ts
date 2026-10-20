import type { BoardPart, HoleArrayCut } from './types'

export interface PullSpec {
  version: 1
  kind: 'knob' | 'bar'
  orientation: 'horizontal' | 'vertical'
  pitch: number
  diameter: number
  horizontal: 'auto' | 'left' | 'right' | 'center'
  vertical: 'top' | 'bottom' | 'center'
  horizontalOffset: number
  verticalOffset: number
}
export const defaultPull = (): PullSpec => ({
  version: 1,
  kind: 'bar',
  orientation: 'vertical',
  pitch: 96,
  diameter: 5,
  horizontal: 'auto',
  vertical: 'top',
  horizontalOffset: 50,
  verticalOffset: 100,
})

/** Shared saved-file and editor boundary. Distances are mm, centre offsets may be signed. */
export function pullSpecError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Pull settings must be an object.'
  const s = value as Record<string, unknown>
  if (s.version !== 1) return 'Unsupported pull settings version.'
  if (!['knob', 'bar'].includes(s.kind as string)) return 'Choose a knob or bar pull.'
  if (!['horizontal', 'vertical'].includes(s.orientation as string))
    return 'Choose a bar orientation.'
  if (!['auto', 'left', 'right', 'center'].includes(s.horizontal as string))
    return 'Choose a horizontal reference.'
  if (!['top', 'bottom', 'center'].includes(s.vertical as string))
    return 'Choose a vertical reference.'
  for (const key of ['pitch', 'diameter', 'horizontalOffset', 'verticalOffset'])
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]))
      return 'Pull dimensions must be finite numbers.'
  if ((s.pitch as number) <= 0 || (s.diameter as number) / 2 <= 0)
    return 'Fixing pitch and diameter must be positive.'
  if (
    (s.horizontal !== 'center' && s.horizontal !== 'auto' && (s.horizontalOffset as number) < 0) ||
    (s.vertical !== 'center' && (s.verticalOffset as number) < 0)
  )
    return 'Edge offsets must be zero or greater.'
  return null
}

export interface PullPattern {
  cut: HoleArrayCut | null
  errors: string[]
}
export function pullPattern(
  panel: Pick<BoardPart, 'length' | 'width' | 'thickness'> & { cuts?: BoardPart['cuts'] },
  settings: PullSpec,
  hinge: 'left' | 'right' | undefined,
  role: string,
): PullPattern {
  const invalid = pullSpecError(settings)
  if (invalid) return { cut: null, errors: [invalid] }
  const { length: h, width: w, thickness: t } = panel
  if (![h, w, t].every((v) => Number.isFinite(v) && v > 0))
    return { cut: null, errors: ['The front must have positive finite dimensions.'] }
  const horizontal =
    settings.horizontal === 'auto'
      ? hinge === 'left'
        ? 'right'
        : hinge === 'right'
          ? 'left'
          : 'center'
      : settings.horizontal
  if (horizontal !== 'center' && settings.horizontalOffset < 0)
    return { cut: null, errors: ['Free-edge offsets must be zero or greater.'] }
  const y =
    horizontal === 'center'
      ? w / 2 + settings.horizontalOffset
      : horizontal === 'left'
        ? settings.horizontalOffset
        : w - settings.horizontalOffset
  const x =
    settings.vertical === 'center'
      ? h / 2 + settings.verticalOffset
      : settings.vertical === 'bottom'
        ? settings.verticalOffset
        : h - settings.verticalOffset
  const count = settings.kind === 'knob' ? 1 : 2
  const vertical = settings.orientation === 'vertical'
  const pitch = count === 1 ? 1 : settings.pitch
  const start = {
    x: x - (vertical && count === 2 ? pitch / 2 : 0),
    y: y - (!vertical && count === 2 ? pitch / 2 : 0),
    z: t,
  }
  const points = Array.from({ length: count }, (_, i) => ({
    x: start.x + (vertical ? pitch * i : 0),
    y: start.y + (!vertical ? pitch * i : 0),
  }))
  const r = settings.diameter / 2
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x - r < 0 ||
        p.x + r > h ||
        p.y - r < 0 ||
        p.y + r > w,
    )
  )
    return { cut: null, errors: ['Fixing holes must lie fully inside the front.'] }
  if (
    count === 2 &&
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) < settings.diameter
  )
    return { cut: null, errors: ['The fixing holes overlap; increase pitch or reduce diameter.'] }
  for (const cut of panel.cuts ?? []) {
    if (
      cut.kind !== 'hole-array' ||
      !cut.id.startsWith('cups_') ||
      (cut.face !== '+Z' && cut.face !== '-Z') ||
      cut.count < 1
    )
      continue
    for (const p of points) {
      const along = cut.axis === 'U' ? p.x - cut.start.x : p.y - cut.start.y
      const i =
        cut.pitch > 0 ? Math.max(0, Math.min(cut.count - 1, Math.round(along / cut.pitch))) : 0
      const cx = cut.start.x + (cut.axis === 'U' ? i * cut.pitch : 0)
      const cy = cut.start.y + (cut.axis === 'V' ? i * cut.pitch : 0)
      if (Math.hypot(p.x - cx, p.y - cy) < r + cut.diameter / 2)
        return { cut: null, errors: ['Fixing holes overlap a modeled hinge cup.'] }
    }
  }
  return {
    cut: {
      kind: 'hole-array',
      id: `pull_${role}`,
      label: 'Handle fixing holes',
      face: '+Z',
      axis: vertical ? 'U' : 'V',
      start,
      pitch,
      count,
      diameter: settings.diameter,
      depth: t,
    },
    errors: [],
  }
}

export function pullHardwareKey(s: PullSpec): string {
  return s.kind === 'knob' ? `pull-knob-d${s.diameter}` : `pull-bar-p${s.pitch}-d${s.diameter}`
}
export function pullHardwareDef(key: string): { name: string; unit: string } | undefined {
  const match = /^pull-(knob|bar)(?:-p(.+))?-d(.+)$/.exec(key)
  if (!match) return undefined
  const [, kind, pitch, diameter] = match
  const valid = (raw: string) =>
    Number.isFinite(Number(raw)) && Number(raw) > 0 && String(Number(raw)) === raw
  if (!valid(diameter) || (kind === 'bar' ? !pitch || !valid(pitch) : pitch !== undefined))
    return undefined
  return {
    name:
      kind === 'knob'
        ? `Knob — ${diameter} mm fixing hole`
        : `${pitch} mm bar pull — ${diameter} mm fixing holes`,
    unit: 'pcs',
  }
}
