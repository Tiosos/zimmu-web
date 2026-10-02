import { RULE_LABELS } from './ruleLabels'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DEFAULT_CABINET_RULES, RULE_KEYS, type RuleKey, type CabinetRules } from '../scene/constructionRules'
import { previewProjectRules, type RulePreview } from '../scene/ruleFlow'
import type { Scene } from '../scene/types'

export function RulePreviewDetails({ preview }: { preview: RulePreview }) {
  return <div className="text-xs space-y-1" aria-live="polite">
    {preview.errors.map((error, index) => <p key={index} className="text-destructive">{error}</p>)}
    {!preview.errors.length && <>
      <p>{preview.changes.length} cabinets affected; {preview.partsChanged} parts changed.</p>
      <p>Hardware quantities or selection: {preview.hardwareChanged ? 'changed' : 'unchanged'}. Review priced BOM before production.</p>
      {preview.changes.map((change) => <p key={change.cabinetId}>{change.label}: {change.fields.map((key) =>
        RULE_LABELS[key as RuleKey] ?? key).join(', ') || 'catalogue version only'}</p>)}
    </>}
  </div>
}

export function CabinetRulesPanel({ scene, onApply }: { scene: Scene; onApply: (preview: RulePreview) => boolean }) {
  const [draft, setDraft] = useState<CabinetRules>(scene.cabinetRules ?? DEFAULT_CABINET_RULES)
  const [preview, setPreview] = useState<RulePreview | null>(null)
  const [error, setError] = useState('')
  const change = (key: RuleKey, value: string) => {
    const project = { ...draft.project }
    if (value === '') delete project[key]
    else Object.assign(project, { [key]: key === 'frontReveal' ? Number(value) : value === '__none__' ? '' : value })
    setDraft({ ...draft, project }); setPreview(null); setError('')
  }
  const options: Partial<Record<RuleKey, string[]>> = {
    backMode: ['captured', 'applied', 'none'], jointMethod: ['dado-rabbet', 'finger', 'dowel', 'butt-screw', 'confirmat'],
    frontMount: ['overlay', 'half-overlay', 'inset'],
  }
  return <section className="border border-border rounded p-3 space-y-2" aria-label="Cabinet project rules">
    <h3 className="text-sm font-medium">Cabinet project rules</h3>
    <p className="text-xs text-muted-foreground">Company rules: {draft.companyId} v{draft.companyVersion} (starter example). Imported company products retain their own published rule pins. Company → catalogue → project → item. Changes require preview and acceptance.</p>
    {RULE_KEYS.map((key) => <label key={key} className="flex gap-2 items-center text-xs">
      <span className="w-32">{RULE_LABELS[key]}</span>
      {key === 'frontReveal' ? <input aria-label={`Project ${RULE_LABELS[key]}`} type="number" min="0" step="0.1"
        placeholder="Inherit" value={draft.project[key] ?? ''} onChange={(e) => change(key, e.target.value)}
        className="bg-background border border-border rounded px-2 py-1" /> :
        <select aria-label={`Project ${RULE_LABELS[key]}`} value={draft.project[key] === '' ? '__none__' : draft.project[key] ?? ''} onChange={(e) => change(key, e.target.value)}
          className="bg-background border border-border rounded px-2 py-1">
          <option value="">Use catalogue/company</option>
          {key === 'edgeMaterial' && <option value="__none__">No edge band</option>}
          {(options[key] ?? Object.keys(scene.materials).filter((name) => key === 'edgeMaterial'
            ? scene.materials[name].use === 'edge' : scene.materials[name].use !== 'edge')).map((value) =>
            <option key={value} value={value}>{value}</option>)}
        </select>}
    </label>)}
    <Button size="sm" variant="outline" onClick={() => { setPreview(previewProjectRules(scene, draft)); setError('') }}>Preview project rules</Button>
    {preview && <><RulePreviewDetails preview={preview} />
      <Button size="sm" disabled={preview.errors.length > 0} onClick={() => {
        if (onApply(preview)) { setPreview(null); setError('') }
        else setError('The design changed after preview. Preview again before applying.')
      }}>Apply project rules</Button></>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}
