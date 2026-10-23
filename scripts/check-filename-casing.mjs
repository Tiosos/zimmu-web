// Fails when two tracked files could be mistaken for one another by module
// resolution.
//
// `./Foo` resolves by probing `Foo.ts`, then `Foo.tsx`. On a case-insensitive
// filesystem (Windows, and macOS by default) the probe for `Foo.ts` also
// matches `foo.ts`, so an import meant for the component beside it loads the
// module instead — and fails, because it exports something else. That is what
// happened to `ProductionReleaseGate.tsx` and `productionReleaseGate.ts`
// (2026-10-09 → fixed 2026-10-23); CI on Linux never saw it.
//
// The rule: two tracked files in the same directory, both of a module
// extension, whose names are equal once the extension is removed and case is
// ignored. Non-module extensions are skipped deliberately — `Button.css` beside
// `Button.tsx` is only ever imported by its full name, so it cannot be confused
// with the component. Run locally with `pnpm check:file-casing`.

import { execFileSync } from 'node:child_process'
import path from 'node:path'

// What TypeScript and Vite probe for an extensionless import.
const MODULE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
])

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const groups = new Map()
for (const file of files) {
  const ext = path.posix.extname(file)
  if (!MODULE_EXTENSIONS.has(ext)) continue
  const stem = path.posix.basename(file, ext)
  const key = `${path.posix.dirname(file)}/${stem}`.toLowerCase()
  const group = groups.get(key)
  if (group) group.push(file)
  else groups.set(key, [file])
}

const collisions = [...groups.values()].filter((group) => group.length > 1)

if (collisions.length > 0) {
  console.error('Filename casing collisions — module resolution can pick the wrong file:')
  for (const group of collisions) console.error(`  ${group.join('  <->  ')}`)
  console.error(`\n${collisions.length} colliding name(s). Rename one file in each pair.`)
  process.exit(1)
}

console.log(`No filename casing collisions across ${files.length} tracked files.`)
