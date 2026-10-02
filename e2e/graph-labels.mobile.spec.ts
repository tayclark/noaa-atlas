// Graph labels on a phone (#292), run as a Pixel 7: the zoom buttons float over the canvas's
// top-right corner, so no label may sit under them, and labels still never overlap.

import { expect, test } from '@playwright/test'
import { labelsIn, overlapping, switchView, visibleLabels, waitForSettledLayout } from './fixtures/graphLabels'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test.use({ reducedMotion: 'reduce' })

test('no label sits under the zoom buttons, in the theme view or the access view', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await page.getByRole('tab', { name: 'Graph' }).tap()
  await waitForSettledLayout(page)
  const controls = (await page.getByRole('group', { name: 'Zoom' }).boundingBox())!

  for (const view of ['Theme view', 'Access view'] as const) {
    if (view === 'Access view') await switchView(page, view)
    const { labels } = await visibleLabels(page)
    expect(labels.length, view).toBeGreaterThan(0)
    expect(labelsIn(labels, controls), view).toEqual([])
    expect(overlapping(labels), view).toEqual([])
  }
})
