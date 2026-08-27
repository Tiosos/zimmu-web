import { CARCASE_PRESETS } from '../carcasePresets'
import { legacyToSection } from '../migrateSections'
import type { CarcaseParams } from '../types'

// The presets reach neither a ladder base, nor dividers, nor a multi-bay shelf. Without this the
// role coverage test would pass while `grainAxisOf` had no answer for five roles.
export const LADDER_WITH_DIVIDERS: CarcaseParams = {
  ...CARCASE_PRESETS[0].params,
  width: 1400,
  baseMode: 'ladder',
  section: legacyToSection([0.5], 1, 1400, 18),
}

// Every combination of the parameters that decide which roles exist, on a carcase large enough for
// all of them to be valid. This is the generator's whole role space — fixtures are checked against
// it rather than against a list anyone typed.
//
// The legacy divider fractions and shelf count stay the loop variables so the sweep spans the same
// space it did before the section tree, and `SWEEP[i]` still names the cabinet `baseline[i]` was
// captured from.
export const SWEEP: CarcaseParams[] = (['toe-kick', 'ladder', 'legs', 'none'] as const).flatMap(
  (baseMode) =>
    (['captured', 'applied', 'none'] as const).flatMap((backMode) =>
      [true, false].flatMap((hasTop) =>
        [[], [1 / 3, 2 / 3]].flatMap((dividers) =>
          [0, 2].map(
            (fixedShelves): CarcaseParams => ({
              ...CARCASE_PRESETS[0].params,
              width: 1400,
              height: 2100,
              baseMode,
              backMode,
              hasTop,
              section: legacyToSection(dividers, fixedShelves, 1400, 18),
            }),
          ),
        ),
      ),
    ),
)
