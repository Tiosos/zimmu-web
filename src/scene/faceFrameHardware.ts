// Blum-backed face-frame hinge selection.
//
// Face-frame geometry belongs to Zimmu; hardware follows it. A cabinet is therefore never resized
// to make a hinge fit. Instead the actual overlap of one door over its hinged stile is measured and
// matched to a published Blum application. If no application covers that overlap, selection
// declines and the caller emits neither manufacturing machining nor a guessed hardware line.
//
// COMPACT 38N/39C overlay is adjustable ±1.5 mm. 38B is the large-overlay face-mount application
// and Blum states it for overlays from 35 mm upward. Inset is a separate CLIP top half-cranked
// application with the 175H5030.21 face-frame adapter.

export type FaceFrameMount = 'overlay' | 'half-overlay' | 'inset'

export type BlumFaceFrameFamily = '38N' | '39C' | '38B' | 'CLIP-inset'

export interface BlumFaceFrameHinge {
  family: BlumFaceFrameFamily
  key: string
  name: string
  partNumber: string
  nominalOverlay: number | null
  cupDepth: number
  plate:
    | { kind: 'wraparound'; pilotDiameter: number }
    | { kind: 'face-mount'; pilotDiameter: number; pitch: number; innerEdgeOffset: number }
    | {
        kind: 'inset-adapter'
        adapterPartNumber: '175H5030.21'
        pilotDiameter: number
        pitch: number
        frontOffset: number
      }
}

const INCH = 25.4
const COMPACT_SIDE_ADJUSTMENT = 1.5

interface CompactChoice {
  family: '38N' | '39C'
  overlay: number
  suffix: string
  cupDepth: number
}

// Screw-on variants only: Zimmu currently emits a cup bore, not the two Ø8 press-in dowel bores.
const COMPACT: CompactChoice[] = [
  { family: '38N', overlay: (3 / 8) * INCH, suffix: '06', cupDepth: 11 },
  { family: '38N', overlay: (1 / 2) * INCH, suffix: '08', cupDepth: 11 },
  { family: '38N', overlay: (5 / 8) * INCH, suffix: '10', cupDepth: 11 },
  { family: '38N', overlay: (3 / 4) * INCH, suffix: '12', cupDepth: 11 },
  { family: '39C', overlay: 1 * INCH, suffix: '16', cupDepth: 13 },
  { family: '39C', overlay: 1.25 * INCH, suffix: '20', cupDepth: 13 },
  { family: '39C', overlay: 1.3125 * INCH, suffix: '21', cupDepth: 13 },
  { family: '39C', overlay: 1.375 * INCH, suffix: '22', cupDepth: 13 },
  { family: '39C', overlay: 1.5 * INCH, suffix: '24', cupDepth: 13 },
  { family: '39C', overlay: 1.5625 * INCH, suffix: '25', cupDepth: 13 },
]

const compact = (choice: CompactChoice): BlumFaceFrameHinge => {
  const partNumber = `${choice.family}355B.${choice.suffix}`
  return {
    family: choice.family,
    key: `hinge-blum-${partNumber.toLowerCase().replace('.', '-')}`,
    name: `Blum COMPACT BLUMOTION ${partNumber}`,
    partNumber,
    nominalOverlay: choice.overlay,
    cupDepth: choice.cupDepth,
    // The wraparound hinge fixes to the face-frame edge. The catalogue states a 1/8 in pilot.
    plate: { kind: 'wraparound', pilotDiameter: 1 / 8 * INCH },
  }
}

export function blumFaceFrameHingeFor(
  mount: FaceFrameMount,
  overlay: number,
): BlumFaceFrameHinge | null {
  if (mount === 'inset') {
    return {
      family: 'CLIP-inset',
      key: 'hinge-blum-clip-inset-175h5030-21',
      name: 'Blum CLIP top inset + 175H5030.21 face-frame adapter',
      partNumber: 'CLIP top half-cranked + 175H5030.21',
      nominalOverlay: null,
      cupDepth: 13,
      plate: {
        kind: 'inset-adapter',
        adapterPartNumber: '175H5030.21',
        pilotDiameter: 3,
        pitch: 32,
        frontOffset: 10,
      },
    }
  }

  if (!(overlay > 0)) return null

  // Blum's 38B face-mount is the continuous large-overlay application. Its replacement guide
  // locates the pilot line X mm from the frame inner edge as X = overlay - 35 + 9.
  if (overlay >= 35) {
    return {
      family: '38B',
      key: 'hinge-blum-38b355bf22',
      name: 'Blum COMPACT BLUMOTION 38B355BF22 face-mount',
      partNumber: '38B355BF22',
      nominalOverlay: null,
      cupDepth: 11,
      plate: {
        kind: 'face-mount',
        pilotDiameter: 5 / 64 * INCH,
        pitch: 40,
        innerEdgeOffset: overlay - 35 + 9,
      },
    }
  }

  let best: CompactChoice | null = null
  let error = Number.POSITIVE_INFINITY
  for (const choice of COMPACT) {
    const e = Math.abs(choice.overlay - overlay)
    if (e <= COMPACT_SIDE_ADJUSTMENT && e < error) {
      best = choice
      error = e
    }
  }
  return best === null ? null : compact(best)
}
