import { expect, test, type Page } from '@playwright/test'
async function setup(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  const finishing = page.getByRole('region', { name: 'Cabinet finishing editor' })
  await finishing.getByLabel('Finishing board name').fill('Machined worktop')
  await finishing.getByLabel('Follow cabinet dimensions').check()
  await finishing.getByRole('button', { name: 'Preview finishing board', exact: true }).click()
  await finishing.getByRole('button', { name: 'Add finishing board', exact: true }).click()
  await page.getByRole('button', { name: 'Worktop machining', exact: true }).click()
  return page.getByRole('region', { name: 'Worktop machining editor' })
}
test('stages a sink opening and edits it with undo, preserving the worktop', async ({ page }) => {
  const editor = await setup(page)
  await editor.getByRole('button', { name: 'Add sink starter', exact: true }).click()
  await editor.getByLabel('Worktop feature name').fill('Kitchen sink opening')
  await editor.getByRole('button', { name: 'Preview worktop machining', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Worktop machining preview' })).toContainText(
    '500.00 × 400.00',
  )
  for (const view of ['Front', 'Top', 'End'])
    await expect(
      editor.getByRole('region', { name: `Machining ${view} preview` }).locator('svg'),
    ).toBeVisible()
  await editor.getByRole('button', { name: 'Apply worktop machining', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('applied')
  await editor.getByLabel('Feature length').fill('450')
  await editor.getByRole('button', { name: 'Preview worktop machining', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Worktop machining preview' })).toContainText(
    '450.00 × 400.00',
  )
  await editor.getByRole('button', { name: 'Apply worktop machining', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply worktop machining"/ }).click()
  await editor.getByRole('button', { name: 'Reset machining draft', exact: true }).click()
  await editor.getByRole('button', { name: 'Kitchen sink opening', exact: true }).click()
  await expect(editor.getByLabel('Feature length')).toHaveValue('500')
  await expect(
    page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Machined worktop' }),
  ).toHaveCount(1)
})
test('creates a blind circular bore, detects duplicate overlap and cancels staged removal', async ({
  page,
}) => {
  const editor = await setup(page)
  await editor.getByRole('button', { name: 'Add circular feature', exact: true }).click()
  await editor.getByLabel('Worktop feature depth mode').selectOption('blind')
  await editor.getByLabel('Feature depth', { exact: true }).fill('10')
  await editor.getByLabel('Feature diameter').fill('50')
  await editor.getByRole('button', { name: 'Duplicate feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview worktop machining', exact: true }).click()
  await expect(editor.getByRole('alert').first()).toContainText('Overlaps')
  await expect(
    editor.getByRole('button', { name: 'Apply worktop machining', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Remove feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview worktop machining', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Worktop machining preview' })).toContainText(
    'depth 10.00',
  )
  await editor.getByRole('button', { name: 'Apply worktop machining', exact: true }).click()
  await editor.getByRole('button', { name: 'Circular opening', exact: true }).click()
  await editor.getByRole('button', { name: 'Remove feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Cancel machining changes', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Circular opening', exact: true })).toBeVisible()
})
test('generated rectangle and circle cuts remove the correct live OCCT volume from the top face', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  const results = await page.evaluate(async () => {
    // @ts-expect-error dev-only Vite module import
    const occt = await import('/src/geom/occt.ts')
    // @ts-expect-error dev-only Vite module import
    const machining = await import('/src/scene/worktopMachining.ts')
    // @ts-expect-error dev-only Vite module import
    const recipes = await import('/src/scene/worktopMachiningRecipe.ts')
    // @ts-expect-error dev-only Vite module import
    const fixture = await import('/src/scene/__fixtures__/worktop.ts')
    const oc = await occt.initOCCT(),
      part = fixture.worktopBoard()
    const results = []
    for (const shape of ['rectangle', 'circle'])
      for (const mode of ['through', 'blind']) {
        const f = { ...recipes.defaultWorktopFeature('test'), shape, mode, depth: 12 }
        const row = machining.resolveWorktopFeatures(part, { version: 1, features: [f] })[0]
        if (row.errors.length) throw Error(row.errors.join('; '))
        const solid = occt.makeShape(oc, { ...part, cuts: [row.cut] })
        const properties = new oc.GProp_GProps_1()
        oc.BRepGProp.VolumeProperties_1(solid, properties, false, false, false)
        const centre = properties.CentreOfMass()
        results.push({ shape, mode, volume: properties.Mass(), centreZ: centre.Z() })
        centre.delete()
        properties.delete()
        solid.delete()
      }
    return results
  })
  const full = 1200 * 600 * 30
  for (const result of results) {
    const depth = result.mode === 'through' ? 30 : 12
    const removed = (result.shape === 'rectangle' ? 200 * 150 : Math.PI * (35 / 2) ** 2) * depth
    expect(result.volume).toBeCloseTo(full - removed, 1)
    expect(result.centreZ).toBeCloseTo(
      (full * 15 - removed * (30 - depth / 2)) / (full - removed),
      3,
    )
  }
})
