import { CABINET_CATALOGUE } from '../scene/catalogue'
import { STARTER_RULES } from '../scene/constructionRules'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { Content, Kind, Published } from './types'

export function seedContent(kind: Kind, versions: Published[]): Content {
  if (kind === 'rule')
    return {
      name: '',
      values: { ...STARTER_RULES.values },
      materials: structuredClone(PRESET_MATERIALS),
    }
  const rule = versions.find((v) => v.kind === 'rule')
  return {
    name: '',
    source: {
      id: CABINET_CATALOGUE[0].catalogueId,
      version: CABINET_CATALOGUE[0].catalogueVersion,
    },
    rule: { id: rule?.definitionId ?? '', version: rule?.version ?? 1 },
    overrides: {},
  }
}
