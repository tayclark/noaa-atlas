// Accessibility helpers shared by the axe specs (#47, #78). One tag set everywhere: WCAG 2.0 to
// 2.2 A/AA, where 2.2 adds `target-size` (a control at least 24px square, or enough space around it).

import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { LAYOUT_SETTLED } from './graph'
import { emptyAlertsFixture, mockAlerts } from './nwsAlerts'
import { mockSwpc } from './swpc'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** The serious and critical violations on the page, one `rule: targets` string each. */
export async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

/** Loads the app with no alerts and the usual SWPC mocks, and waits for the graph to settle. */
export async function openApp(page: Page) {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.locator(LAYOUT_SETTLED)).toBeAttached({ timeout: 20_000 })
}
