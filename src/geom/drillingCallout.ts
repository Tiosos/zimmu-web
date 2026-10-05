import type { CutDef, DowelCut } from '../scene/types'
type Drilling = Extract<
  CutDef | DowelCut,
  { kind: 'hole-array' | 'bore-axial' | 'bore-transverse' }
>

// These are printed nominal definitions, not a tool path or a verification of tool access.
export function drillingCallout(op: Drilling): string {
  const base = `[${op.id}] DIA ${op.diameter}; depth ${op.depth} mm`
  switch (op.kind) {
    case 'hole-array':
      return `${base}; face ${op.face}; ${op.count} holes; pitch ${op.pitch} mm along ${op.axis}; start ${op.start.x},${op.start.y},${op.start.z} mm`
    case 'bore-axial':
      return `${base}; axial from ${op.end}`
    case 'bore-transverse':
      return `${base}; transverse at ${op.position} mm; azimuth ${op.azimuth} degrees`
  }
}
