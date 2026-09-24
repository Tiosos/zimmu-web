import { legacyToSection } from './migrateSections'
import { defaultInterior, seedInteriors } from './sectionInterior'
import type { FrontSpec, Section } from './sectionTree'
import type { CarcaseParams, MaterialDef } from './types'

export interface CarcasePreset {
  name: string
  params: CarcaseParams
}

// Exported because the file parser needs them: a pre-v14 carcase names one material and states its
// own thickness, so the slots it does not have have to fall back on the names a new scene is seeded
// with.
export const DEFAULT_CARCASE_MATERIAL = '18mm Ply'
export const DEFAULT_BACK_MATERIAL = '12mm MDF'
// Solid stock, and deliberately WITHOUT a `sheet`: `isNestable` keys off the material, so a frame
// member is excluded from the nest by what it is made of rather than by a rule about its role.
export const DEFAULT_FRAME_MATERIAL = 'Hardwood 20mm'
// The one place the preset panel thickness is written. `legacyToSection` needs it as a number —
// a section percentage is a share of the clear span, so it depends on what the divisions spend.
const CARCASE_THICKNESS = 18

// The materials the presets name. `CARCASE_PRESETS` is data, so a scene that has never seen these
// definitions cannot resolve a single panel: seeded wherever a new scene is created, and the
// preset test drops each preset into a fresh scene to prove it.
export const PRESET_MATERIALS: Record<string, MaterialDef> = {
  [DEFAULT_CARCASE_MATERIAL]: { thickness: CARCASE_THICKNESS },
  [DEFAULT_BACK_MATERIAL]: { thickness: 12 },
  [DEFAULT_FRAME_MATERIAL]: { thickness: 20 },
}

// Fronts are the same 18 mm ply as the carcase until someone says otherwise. A separate slot with
// the same default is the point: changing it is one edit, and the nest reports it separately.
export const DEFAULT_FRONT_MATERIAL = DEFAULT_CARCASE_MATERIAL

// Shared by every preset: the parameters a cabinet's *size* does not change.
const COMMON = {
  carcaseMaterial: DEFAULT_CARCASE_MATERIAL,
  backMaterial: DEFAULT_BACK_MATERIAL,
  // Every cabinet names one, framed or not — the slot exists even when nothing uses it, exactly
  // as `frontMaterial` did before there were fronts. The presets stay frameless (`frame` absent).
  frameMaterial: DEFAULT_FRAME_MATERIAL,
  backMode: 'captured',
  // What a shop reaches for first: butt joints pulled together with screws. A dado is a decision
  // the user makes, not the one they get by default — and unlike dowel or confirmat, screwing is a
  // joint the app can derive geometry for, so the cabinet it drops in is fully described.
  jointMethod: 'butt-screw',
  frontMaterial: DEFAULT_FRONT_MATERIAL,
  // Overlay, because it is what a frameless cabinet is: the doors cover the carcase edges. Inset is
  // a decision, not a default — it needs tighter tolerances and it moves every shelf back.
  frontMount: 'overlay',
  // 3 mm: the gap a frameless kitchen is usually built to, and small enough that a wrong reveal
  // reads as a defect rather than as a style.
  frontReveal: 3,
} satisfies Partial<CarcaseParams>

// Every opening a preset makes wants the same shelving, which is exactly what the one cabinet-wide
// bundle meant. The pin geometry is `defaultInterior`'s — the same one the panel gives a bare
// opening — so how many shelves sit in it is the only thing a preset states for itself.
const shelved = (dividers: number[], fixedShelves: number, width: number, shelves: number) =>
  seedInteriors(
    legacyToSection(dividers, fixedShelves, width, CARCASE_THICKNESS),
    defaultInterior(shelves),
  )

// A cabinet that bores hinge positions and hangs nothing on them is a carcase, not a cabinet — the
// same argument that gave the presets their shelves. Hinged left because a single door has to be
// hinged somewhere and the user flips it in one click.
const DOOR: FrontSpec = { kind: 'door', leaves: 1, hinge: 'left' }

const PAIR: FrontSpec = { kind: 'door', leaves: 2, hinge: 'left' }

// Only a leaf wears a front, which is exactly why a pantry's shelves are stated as `fixedShelves`
// on its interior rather than as splits: four splits would make five stacked sections, and five
// doors on a pantry is not a pantry. As one leaf it takes one pair of doors over the whole front.
const doored = (root: Section, front: FrontSpec = DOOR): Section => ({ ...root, front })

export const CARCASE_PRESETS: CarcasePreset[] = [
  {
    name: 'Base 600',
    params: {
      ...COMMON,
      width: 600,
      height: 720,
      depth: 560,
      hasTop: true,
      baseMode: 'toe-kick',
      toeKickHeight: 100,
      toeKickSetback: 60,
      // One clear opening holding one adjustable shelf. A base unit is shelved by what the user
      // moves, not by a partition built into it — the fixed shelf this preset used to carry was
      // inherited from the v12 `fixedShelves: 1` parameter, not chosen.
      section: doored(shelved([], 0, 600, 1)),
    },
  },
  {
    name: 'Wall 600',
    params: {
      ...COMMON,
      width: 600,
      height: 720,
      depth: 330,
      hasTop: true,
      baseMode: 'none',
      toeKickHeight: 100,
      toeKickSetback: 60,
      section: doored(shelved([], 0, 600, 1)),
    },
  },
  {
    name: 'Tall 600',
    params: {
      ...COMMON,
      width: 600,
      height: 2100,
      depth: 560,
      hasTop: true,
      baseMode: 'toe-kick',
      toeKickHeight: 100,
      toeKickSetback: 60,
      // The one preset whose shelves are structure rather than convenience: a pantry's four fixed
      // shelves are what it is. Stated on the interior rather than as splits so the cabinet stays
      // one opening and wears one pair of doors; bored for pins so a user can add loose shelves,
      // and seating none, because nine shelves in a 2100 mm cabinet is not a cabinet anyone asked
      // for.
      section: doored(
        seedInteriors(legacyToSection([], 0, 600, CARCASE_THICKNESS), defaultInterior(0, 4)),
        PAIR,
      ),
    },
  },
]
