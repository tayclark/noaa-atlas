import type { Page } from '@playwright/test'

/** Makes every canvas refuse a WebGL context, as a browser with WebGL turned off does (#260). */
export async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error -- the overloads can't be matched by a wrapper; it only passes arguments on.
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null
      return getContext.call(this, type, ...rest)
    }
  })
}
