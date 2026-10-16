import { expect, it } from 'vitest'
import { canonicalJson } from './canonicalJson'

// Verbatim copies of the two helpers this one replaced, kept as oracles.
function compareReleaseSourceCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compareReleaseSourceCanonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${compareReleaseSourceCanonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
function resumeChangeReviewCanonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((v) => (v === undefined ? 'null' : resumeChangeReviewCanonical(v))).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${resumeChangeReviewCanonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

// Every input both callers compare was parsed from JSON or built from parsed JSON.
const JSON_VALUES: string[] = [
  'null',
  'true',
  'false',
  '0',
  '-0',
  '1.5',
  '-1e-7',
  '123456789.123456',
  '1e21',
  '""',
  '"Café ✓ 𝄞 \\u0000 \\n \\t \\" \\\\ \\u2028"',
  '[]',
  '{}',
  '[[], {}, [null], {"a": []}]',
  '{"b": 1, "a": 2, "A": 3, "_": 4, "é": 5, "10": 6, "9": 7}',
  '{"z": {"y": [3, 1, 2], "x": {"d": null, "c": [{"b": 1, "a": 0}]}}, "a": "\\ud83d\\ude00"}',
  '[{"id": "p2", "label": "Side <L>"}, {"label": "Top", "id": "p1"}]',
  '{"dimensions": {"length": 720.5, "width": 560, "thickness": 18}, "edges": {"x0": null}}',
]

it.each(JSON_VALUES)('matches both replaced helpers on parsed JSON %s', (text) => {
  const value: unknown = JSON.parse(text)
  expect(canonicalJson(value)).toBe(compareReleaseSourceCanonical(value))
  expect(canonicalJson(value)).toBe(resumeChangeReviewCanonical(value))
})

it('ignores object-key order but not array order', () => {
  expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
    canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
  )
  expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
})

it('treats undefined as its saved JSON does, as the resume check requires', () => {
  for (const value of [undefined, { a: undefined, b: 1 }, [1, undefined], { a: [undefined] }])
    expect(canonicalJson(value)).toBe(resumeChangeReviewCanonical(value))
  expect(canonicalJson({ a: undefined, b: [undefined] })).toBe(
    canonicalJson(JSON.parse(JSON.stringify({ a: undefined, b: [undefined] }))),
  )
})
