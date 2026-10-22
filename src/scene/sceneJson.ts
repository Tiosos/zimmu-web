import type { Scene } from './types'

// Scene objects are replaced, never mutated, so an element's JSON can be reused for as long as the
// element itself is. A drag then re-serialises the one part it moved instead of the whole scene.
const cache = new WeakMap<object, string>()

function memo(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  let json = cache.get(value)
  if (json === undefined) {
    json = JSON.stringify(value) ?? 'null'
    cache.set(value, json)
  }
  return json
}

// Byte-identical to JSON.stringify(scene); dirty tracking compares it against that.
export function sceneJson(scene: Scene): string {
  const fields: string[] = []
  for (const [key, value] of Object.entries(scene)) {
    if (value === undefined || typeof value === 'function') continue
    const json = Array.isArray(value) ? `[${value.map(memo).join(',')}]` : JSON.stringify(value)
    fields.push(`${JSON.stringify(key)}:${json}`)
  }
  return `{${fields.join(',')}}`
}
