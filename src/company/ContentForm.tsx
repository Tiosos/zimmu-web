import { useState } from 'react'
import type { CarcaseParams, MaterialDef } from '../scene/types'
import { CABINET_CATALOGUE } from '../scene/catalogue'
import { RULE_KEYS, type RuleKey } from '../scene/constructionRules'
import { RULE_LABELS } from '../ui/ruleLabels'
import type { Content, Kind, ProductContent, Published, RuleContent } from './types'

const dimensionLabels = {
  width: 'Width',
  height: 'Height',
  depth: 'Depth',
  toeKickHeight: 'Toe kick height',
  toeKickSetback: 'Toe kick setback',
}
const inputClass = 'bg-background border border-border rounded px-2 py-1 w-full'
const options: Partial<Record<keyof CarcaseParams, string[]>> = {
  backMode: ['captured', 'applied', 'none'],
  jointMethod: ['dado-rabbet', 'finger', 'dowel', 'butt-screw', 'confirmat'],
  frontMount: ['overlay', 'half-overlay', 'inset'],
  baseMode: ['none', 'toe-kick', 'ladder', 'legs'],
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  )
}
function ConstructionFields({
  values,
  materials,
  optional,
  onChange,
}: {
  values: Partial<CarcaseParams>
  materials: Record<string, MaterialDef>
  optional: boolean
  onChange: (values: Partial<CarcaseParams>) => void
}) {
  function change(key: keyof CarcaseParams, raw: string) {
    const next = { ...values }
    if (optional && raw === '') delete next[key]
    else
      Object.assign(next, {
        [key]: raw === '__none__' ? '' : key === 'frontReveal' ? Number(raw) : raw,
      })
    onChange(next)
  }
  return (
    <>
      {RULE_KEYS.map((key: RuleKey) => (
        <Field key={key} label={RULE_LABELS[key]}>
          {key === 'frontReveal' ? (
            <input
              className={inputClass}
              aria-label={RULE_LABELS[key]}
              type="number"
              min="0"
              step="0.1"
              placeholder={optional ? 'Inherit' : ''}
              value={values[key] ?? ''}
              onChange={(e) => change(key, e.target.value)}
            />
          ) : (
            <select
              className={inputClass}
              aria-label={RULE_LABELS[key]}
              value={values[key] === '' ? '__none__' : (values[key] ?? '')}
              onChange={(e) => change(key, e.target.value)}
            >
              {optional && <option value="">Inherit pinned rule/layout</option>}
              {key === 'edgeMaterial' && <option value="__none__">No edge band</option>}
              {key.endsWith('Material') &&
                values[key] &&
                !Object.hasOwn(materials, String(values[key])) && (
                  <option value={String(values[key])}>
                    Unavailable stock: {String(values[key])}
                  </option>
                )}
              {(
                options[key] ??
                Object.keys(materials).filter((name) =>
                  key === 'edgeMaterial'
                    ? materials[name].use === 'edge'
                    : materials[name].use !== 'edge',
                )
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </Field>
      ))}
    </>
  )
}
export function ContentForm({
  kind,
  content,
  versions,
  onChange,
}: {
  kind: Kind
  content: Content
  versions: Published[]
  onChange: (value: Content) => void
}) {
  const rule = content as RuleContent
  const product = content as ProductContent
  const rules = versions.filter((v) => v.kind === 'rule')
  const master = rules.find(
    (v) => v.definitionId === product.rule?.id && v.version === product.rule?.version,
  )?.content as RuleContent | undefined
  return (
    <div className="space-y-4">
      <Field label="Name">
        <input
          className={inputClass}
          aria-label="Name"
          value={content.name}
          maxLength={160}
          required
          onChange={(e) => onChange({ ...content, name: e.target.value })}
        />
      </Field>
      {kind === 'rule' ? (
        <>
          <p className="text-sm text-muted-foreground">
            Review the starting example values and stock before company publication.
          </p>
          <fieldset className="space-y-2">
            <legend className="font-medium">Material stock</legend>
            {Object.entries(rule.materials).map(([name, stock]) => (
              <div
                key={name}
                className="flex flex-wrap gap-2 items-end border-b border-border pb-2"
              >
                <span className="w-36 break-words text-sm">{name}</span>
                <Field label={`${name} thickness (mm)`}>
                  <input
                    className={inputClass}
                    aria-label={`${name} thickness (mm)`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={stock.thickness}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        materials: {
                          ...rule.materials,
                          [name]: { ...stock, thickness: Number(e.target.value) },
                        },
                      })
                    }
                  />
                </Field>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={stock.hasGrain ?? false}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        materials: {
                          ...rule.materials,
                          [name]: { ...stock, hasGrain: e.target.checked },
                        },
                      })
                    }
                  />{' '}
                  Grain: {name}
                </label>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={stock.use === 'edge'}
                    onChange={(e) => {
                      const next = { ...stock }
                      if (e.target.checked) next.use = 'edge'
                      else delete next.use
                      onChange({ ...rule, materials: { ...rule.materials, [name]: next } })
                    }}
                  />{' '}
                  Edge band: {name}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const materials = { ...rule.materials }
                    delete materials[name]
                    onChange({ ...rule, materials })
                  }}
                >
                  Remove {name}
                </button>
              </div>
            ))}
            <AddStock
              materials={rule.materials}
              onAdd={(name) =>
                onChange({ ...rule, materials: { ...rule.materials, [name]: { thickness: 18 } } })
              }
            />
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <ConstructionFields
              values={rule.values}
              materials={rule.materials}
              optional={false}
              onChange={(values) => onChange({ ...rule, values })}
            />
          </div>
        </>
      ) : (
        <>
          <Field label="Starter layout">
            <select
              className={inputClass}
              aria-label="Starter layout"
              value={JSON.stringify(product.source)}
              onChange={(e) =>
                onChange({
                  ...product,
                  source: JSON.parse(e.target.value) as ProductContent['source'],
                })
              }
            >
              {CABINET_CATALOGUE.map((v) => (
                <option
                  key={v.catalogueId}
                  value={JSON.stringify({ id: v.catalogueId, version: v.catalogueVersion })}
                >
                  {v.name} — {v.catalogueId} v{v.catalogueVersion}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Published company rules">
            <select
              className={inputClass}
              aria-label="Published company rules"
              required
              value={JSON.stringify(product.rule)}
              onChange={(e) =>
                onChange({ ...product, rule: JSON.parse(e.target.value) as ProductContent['rule'] })
              }
            >
              {!master && (
                <option value={JSON.stringify(product.rule)}>
                  Select a published rule version
                </option>
              )}
              {rules.map((v) => (
                <option
                  key={`${v.definitionId}:${v.version}`}
                  value={JSON.stringify({ id: v.definitionId, version: v.version })}
                >
                  {v.content.name} — {v.definitionId} v{v.version}
                </option>
              ))}
            </select>
          </Field>
          {!rules.length && (
            <p role="status">IT must publish company rules before a product can be saved.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Blank overrides inherit the pinned rule/layout. Changing a pin does not update existing
            published products.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(['width', 'height', 'depth', 'toeKickHeight', 'toeKickSetback'] as const).map(
              (key) => (
                <Field key={key} label={`${dimensionLabels[key]} override (mm)`}>
                  <input
                    className={inputClass}
                    aria-label={`${dimensionLabels[key]} override (mm)`}
                    type="number"
                    min="0"
                    placeholder="Inherit"
                    value={product.overrides[key] ?? ''}
                    onChange={(e) => {
                      const overrides = { ...product.overrides }
                      if (e.target.value === '') delete overrides[key]
                      else overrides[key] = Number(e.target.value)
                      onChange({ ...product, overrides })
                    }}
                  />
                </Field>
              ),
            )}
            <Field label="Base mode override">
              <select
                className={inputClass}
                aria-label="Base mode override"
                value={product.overrides.baseMode ?? ''}
                onChange={(e) => {
                  const overrides = { ...product.overrides }
                  if (!e.target.value) delete overrides.baseMode
                  else overrides.baseMode = e.target.value as CarcaseParams['baseMode']
                  onChange({ ...product, overrides })
                }}
              >
                <option value="">Inherit</option>
                {options.baseMode?.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Top override">
              <select
                className={inputClass}
                aria-label="Top override"
                value={
                  product.overrides.hasTop === undefined ? '' : String(product.overrides.hasTop)
                }
                onChange={(e) => {
                  const overrides = { ...product.overrides }
                  if (!e.target.value) delete overrides.hasTop
                  else overrides.hasTop = e.target.value === 'true'
                  onChange({ ...product, overrides })
                }}
              >
                <option value="">Inherit</option>
                <option value="true">Has top</option>
                <option value="false">No top</option>
              </select>
            </Field>
            <ConstructionFields
              values={product.overrides}
              materials={master?.materials ?? {}}
              optional
              onChange={(overrides) => onChange({ ...product, overrides })}
            />
          </div>
        </>
      )}
    </div>
  )
}
function AddStock({
  materials,
  onAdd,
}: {
  materials: Record<string, MaterialDef>
  onAdd: (name: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="flex gap-2">
      <input
        aria-label="New stock name"
        className={inputClass}
        maxLength={160}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New stock name"
      />
      <button
        type="button"
        disabled={
          !name.trim() ||
          Object.hasOwn(materials, name.trim()) ||
          Object.keys(materials).length >= 100
        }
        onClick={() => {
          onAdd(name.trim())
          setName('')
        }}
      >
        Add stock
      </button>
    </div>
  )
}
