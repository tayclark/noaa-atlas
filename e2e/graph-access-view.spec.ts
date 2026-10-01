// Access-method view (#60): the switch groups services under hubs for how their data is reached.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

test('the access view shows access hubs and rings token-gated services, and switches back', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  const svg = page.locator('svg[aria-label="Service graph"]')
  await expect(svg).toHaveAttribute('data-layout-settled', 'true', { timeout: 20_000 })

  const toggle = page.getByRole('button', { name: 'Access view' })
  await expect(page.locator('[data-node-id="access-rest"]')).toBeHidden()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  for (const id of ['access-rest', 'access-arcgis-rest', 'access-ogc', 'access-cloud-bucket', 'access-file-download']) {
    await expect(page.locator(`[data-node-id="${id}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-node-id="theme-weather"]')).toBeHidden()
  await expect(page.locator('[data-node-id="office-nws"]')).toBeHidden()
  await expect(page.locator('.graph-node-gated')).toHaveCount(2)
  await expect(svg).toHaveAttribute('data-layout-settled', 'true', { timeout: 20_000 })

  // A service settles nearer its own hub than another method's hub.
  const centre = async (id: string) => {
    const box = (await page.locator(`[data-node-id="${id}"] circle`).boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const distance = async (a: string, b: string) => {
    const [p, q] = [await centre(a), await centre(b)]
    return Math.hypot(p.x - q.x, p.y - q.y)
  }
  expect(await distance('goes-aws-open-data', 'access-cloud-bucket')).toBeLessThan(await distance('goes-aws-open-data', 'access-rest'))
  expect(await distance('nws-api', 'access-rest')).toBeLessThan(await distance('nws-api', 'access-cloud-bucket'))

  // Services stay selectable by keyboard in this view too.
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'NWS API', exact: false }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Theme view' }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-node-id="theme-weather"]')).toBeVisible()
  await expect(page.locator('[data-node-id="access-rest"]')).toBeHidden()
})
