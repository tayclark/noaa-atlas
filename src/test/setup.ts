// Vitest setup for every test file. Testing Library only unmounts after each test by itself when
// Vitest's globals are on, and they are off here, so this registers its cleanup instead. The default
// environment is node, so it is only loaded where a file opts into jsdom.

import { afterEach } from 'vitest'

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)
}
