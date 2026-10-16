// Equal exactly when the JSON texts are equal up to object-key order: array order stays
// significant, and undefined is treated as JSON.stringify treats it, so a value compares equal
// to its own saved JSON.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
