// Why each `.zimmu` format version exists. The parser does not branch on version after v20: a
// feature that arrived later is an optional field, so an older file is a file that lacks it. That
// makes this table the only place the sequence is written down — git shows it only for the bumps
// that landed one commit at a time, and three recent commits each bumped several versions at once,
// so a version inside such a range cannot be tied to a single feature from history.
//
// Bumping FILE_FORMAT_VERSION without extending this table fails fileFormatHistory.test.ts.
export interface FileFormatStep {
  first: number
  last: number
  summary: string
  // Present where one commit introduced the step and git can prove it.
  commit?: string
}

export const FILE_FORMAT_HISTORY: readonly FileFormatStep[] = [
  { first: 11, last: 11, summary: 'component tree' },
  { first: 12, last: 12, summary: 'backSetback' },
  { first: 13, last: 13, summary: 'section tree (replaces dividers and fixedShelves)' },
  { first: 14, last: 14, summary: 'thickness moves from the carcase to its materials' },
  { first: 15, last: 15, summary: 'screw joints' },
  { first: 16, last: 16, summary: 'section interiors' },
  { first: 17, last: 17, summary: 'fronts' },
  { first: 18, last: 18, summary: 'drawers' },
  { first: 19, last: 19, summary: 'anchors' },
  { first: 20, last: 20, summary: 'face frames' },
  { first: 21, last: 21, summary: 'project hierarchy' },
  { first: 22, last: 22, summary: 'room geometry' },
  { first: 23, last: 23, summary: 'site levels and clearance assessments' },
  { first: 24, last: 24, summary: 'edge banding' },
  { first: 25, last: 25, summary: 'pinned cabinet catalogue references and item overrides' },
  { first: 26, last: 26, summary: 'pinned construction rules and sparse project overrides' },
  { first: 27, last: 27, summary: 'shared manufacturing part record' },
  { first: 28, last: 28, summary: 'recorded production releases', commit: '807f553' },
  { first: 29, last: 29, summary: 'cabinet-following finishing panels', commit: 'c8c0962' },
  { first: 30, last: 30, summary: 'handle and pull drilling', commit: '074d0eb' },
  { first: 31, last: 31, summary: 'linked worktops spanning cabinet runs', commit: '2997665' },
  { first: 32, last: 32, summary: 'worktop cut-outs and machining', commit: 'cd4b6d4' },
  { first: 33, last: 33, summary: 'hinge layout and drawer runner controls', commit: 'eea2768' },
  { first: 34, last: 34, summary: 'run-spanning plinths and splashbacks', commit: 'b0274b5' },
  {
    first: 35,
    last: 37,
    summary: 'cabinet materials and edge banding, appliance services, corner assemblies',
    commit: '78cb893',
  },
  {
    first: 38,
    last: 39,
    summary: 'room installation, wall fillers, door and drawer opening motion',
    commit: '9d29edd',
  },
  {
    first: 40,
    last: 42,
    summary: 'front grain matching, stock optimisation, sloped cabinets',
    commit: 'bae06a7',
  },
]
