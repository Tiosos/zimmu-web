import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Runs the WCAG A/AA rule set and returns readable failure descriptions.
 *
 * `nested-interactive` is disabled on purpose: the elevation/plan SVGs contain keyboard-operable
 * <g role="button"> hotspots inside a labelled graphic, a pattern axe's generic DOM rule cannot
 * express. The same hotspots are covered by e2e/keyboard-access.spec.ts.
 */
export async function axeViolations(page: Page, label: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['nested-interactive'])
    .analyze()
  return results.violations.map(
    (violation) =>
      `${label}: ${violation.id} ${violation.impact ?? 'n/a'} x${violation.nodes.length}:\n` +
      violation.nodes
        .slice(0, 20)
        .map(
          (node) =>
            `  target=${node.target.join(' ')}\n  html=${node.html.slice(0, 260)}\n  why=${(node.failureSummary ?? '').replace(/\n/g, ' ').slice(0, 320)}`,
        )
        .join('\n'),
  )
}
