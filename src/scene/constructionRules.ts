import { CARCASE_PRESETS } from './carcasePresets'
import type { CarcaseParams } from './types'

export const RULE_KEYS = ['carcaseMaterial', 'backMaterial', 'frontMaterial', 'frameMaterial',
  'edgeMaterial', 'backMode', 'jointMethod', 'frontMount', 'frontReveal'] as const
export type RuleKey = typeof RULE_KEYS[number]
export type RuleOverrides = Partial<Pick<CarcaseParams, RuleKey>>
export interface CabinetRules {
  companyId: string
  companyVersion: number
  project: RuleOverrides
}
export const STARTER_RULES = {
  id: 'starter.construction', version: 1,
  values: Object.fromEntries(RULE_KEYS.filter((key) => CARCASE_PRESETS[0].params[key] !== undefined)
    .map((key) => [key, CARCASE_PRESETS[0].params[key]])) as RuleOverrides,
}
export const DEFAULT_CABINET_RULES: CabinetRules = {
  companyId: STARTER_RULES.id, companyVersion: STARTER_RULES.version, project: {},
}
export function companyRuleValues(rules: CabinetRules = DEFAULT_CABINET_RULES): RuleOverrides | undefined {
  return rules.companyId === STARTER_RULES.id && rules.companyVersion === STARTER_RULES.version
    ? STARTER_RULES.values : undefined
}
