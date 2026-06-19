// Regenerates the auto-managed regions of project-structure.html.
//
// Run by .github/workflows/update-project-structure.yml on every published
// release, and safe to run locally (`node scripts/update-structure-html.mjs`).
//
// What it updates, marked in the HTML by <!-- AUTOGEN:NAME --> … <!-- /AUTOGEN:NAME -->:
//   src-tree         full src/ file tree (regenerated from disk)
//   docs-tree        full docs/ file tree (regenerated from disk)
//   test-file-count  count of *.test.ts / *.test.tsx files under src/
//   version          release tag — only stamped when RELEASE_TAG is set
//   date             release date  — only stamped when RELEASE_TAG is set
//
// Stamping is gated on RELEASE_TAG so local runs touch only the derived trees,
// never the version/date (which a release owns).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const HTML_PATH = path.join(ROOT, 'project-structure.html')

function htmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildTree(dirAbs, rootLabel) {
  const lines = [`${rootLabel}/`]
  walk(dirAbs, '', lines)
  return lines.map(htmlEscape).join('\n')
}

function walk(dir, prefix, lines) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1
    const branch = last ? '└── ' : '├── '
    const name = entry.isDirectory() ? `${entry.name}/` : entry.name
    lines.push(prefix + branch + name)
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name), prefix + (last ? '    ' : '│   '), lines)
    }
  })
}

function countTestFiles(dir) {
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countTestFiles(path.join(dir, entry.name))
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      count += 1
    }
  }
  return count
}

function replaceRegion(html, name, value) {
  const re = new RegExp(
    `(<!-- AUTOGEN:${name} -->)[\\s\\S]*?(<!-- /AUTOGEN:${name} -->)`,
    'g',
  )
  if (!re.test(html)) throw new Error(`AUTOGEN region not found: ${name}`)
  return html.replace(re, (_match, open, close) => open + value + close)
}

let html = readFileSync(HTML_PATH, 'utf-8')

html = replaceRegion(html, 'src-tree', buildTree(path.join(ROOT, 'src'), 'src'))
html = replaceRegion(html, 'docs-tree', buildTree(path.join(ROOT, 'docs'), 'docs'))
html = replaceRegion(html, 'test-file-count', String(countTestFiles(path.join(ROOT, 'src'))))

const tag = process.env.RELEASE_TAG?.trim()
if (tag) {
  const date = (process.env.RELEASE_DATE?.trim() || new Date().toISOString()).slice(0, 10)
  html = replaceRegion(html, 'version', htmlEscape(tag))
  html = replaceRegion(html, 'date', date)
  console.log(`Stamped release ${tag} (${date}).`)
} else {
  console.log('No RELEASE_TAG set — regenerated trees only, left version/date untouched.')
}

writeFileSync(HTML_PATH, html)
console.log('project-structure.html regenerated.')
