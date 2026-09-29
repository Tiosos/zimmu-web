import { test, expect } from '@playwright/test'

test('records explicit room evidence and shows it in plan and elevation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'File ▾' }).click()
  await page.getByRole('button', { name: 'Project structure…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Project structure' })
  await dialog.getByRole('button', { name: 'Add wall' }).click()
  await expect(dialog.getByText(/site length not verified/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Add door' }).click()
  await expect(dialog.getByText(/hinge side and swing reach not assessed/)).toBeVisible()

  await dialog.getByRole('combobox', { name: /Hinge for opening_/ }).selectOption('start')
  await dialog.getByRole('combobox', { name: /Swing side for opening_/ }).selectOption('left')
  await dialog.getByRole('spinbutton', { name: /Swing reach for opening_/ }).fill('850')
  await dialog.getByRole('button', { name: 'Record swing' }).click()
  await expect(dialog.getByText(/hinge side and swing reach not assessed/)).toHaveCount(0)

  await dialog.getByRole('textbox', { name: 'Level datum' }).fill('Project ±0')
  await dialog.getByRole('textbox', { name: 'Level point name' }).fill('Floor corner')
  await dialog.getByRole('spinbutton', { name: 'Elevation mm' }).fill('-12')
  await dialog.getByRole('spinbutton', { name: 'Uncertainty ±mm' }).fill('2')
  await dialog.getByRole('textbox', { name: 'Level source' }).fill('Site laser')
  await dialog.getByRole('button', { name: 'Record level' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Level datum' })).toBeDisabled()
  await expect(dialog.getByRole('img', { name: 'Elevation of Wall 1' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Plan' }).click()
  await expect(page.getByTestId(/^plan-level-/)).toBeVisible()
  await expect(page.getByTestId(/^plan-door-swing-/)).toBeVisible()
})
