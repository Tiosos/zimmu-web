// The hardware a generated cabinet implies, as stated figures rather than derived ones — the same
// contract `frontMachining.ts` has, and for the same reason. A wrong name or nominal here produces
// a perfectly self-consistent quote for parts that do not fit, and no test in this repo can
// falsify it. Treat this table as needing a woodworker's eye.
//
// No vendor catalogue is modelled: a key names a *kind* of item, and the price, supplier and part
// number for it live in the hardware library, which is global rather than per project.

export interface HardwareDef {
  name: string
  unit: string
}

export const HINGE_OVERLAY_KEY = 'hinge-overlay'
export const HINGE_INSET_KEY = 'hinge-inset'
export const SHELF_PIN_KEY = 'shelf-pin-5mm'
// One key, not a family: `defaultJoint.ts` models exactly one carcase screw — #8 ⌀4.2, 5 mm
// clearance, 3 mm pilot, 30 mm deep — shared by every screw joint. A key derived from bore depth
// would order a different screw when a panel is overridden to 25 mm, while the modelled fastener
// has not changed at all.
export const SCREW_KEY = 'screw-8x40'

// What a runner is stocked in. Deliberately not every length made: a quote naming a length nobody
// stocks is worse than one naming the next size down.
export const RUNNER_NOMINALS = [250, 300, 350, 400, 450, 500, 550, 600]

export const HARDWARE_CATALOGUE: Record<string, HardwareDef> = {
  [HINGE_OVERLAY_KEY]: { name: '110° hinge c/w plate', unit: 'pcs' },
  [HINGE_INSET_KEY]: { name: '110° inset hinge c/w plate', unit: 'pcs' },
  ...Object.fromEntries(
    RUNNER_NOMINALS.map((n) => [`runner-${n}`, { name: `${n} mm drawer runner`, unit: 'pair' }]),
  ),
  [SHELF_PIN_KEY]: { name: '5 mm shelf pin', unit: 'pcs' },
  [SCREW_KEY]: { name: '#8 × 40 mm carcase screw', unit: 'pcs' },
}

// Insertion order, which is what gives every grouped table and every CSV the same row order
// without any consumer stating one of its own.
export const CATALOGUE_ORDER = Object.keys(HARDWARE_CATALOGUE)

// The largest nominal that fits. Below the smallest, the bay lists no runner rather than one that
// will not go in.
export function runnerKeyFor(clearDepth: number): string | null {
  let best: number | null = null
  for (const n of RUNNER_NOMINALS) if (n <= clearDepth) best = n
  return best === null ? null : `runner-${best}`
}

// The one figure read from a parameter rather than from geometry. An overlay hinge and an inset
// hinge are different products fitted to identically bored doors, so the bores cannot answer this
// and asking them would be false precision.
// Undefined for half-overlay: that door hangs on a face-frame hinge, which is not catalogued yet.
// Declining is the rule a door too thin to bore already follows — the cabinet lists no hinge
// rather than an overlay one that does not fit a frame.
export function hingeKeyFor(mount: 'overlay' | 'half-overlay' | 'inset'): string | undefined {
  if (mount === 'half-overlay') return undefined
  return mount === 'overlay' ? HINGE_OVERLAY_KEY : HINGE_INSET_KEY
}
