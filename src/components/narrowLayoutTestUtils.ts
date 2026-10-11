// Test helper: a test that needs the compact (phone) layout installs a matchMedia stub that answers
// the layout query (see src/test/matchMedia.ts). Any other query (reduced motion, say) reports no
// match, so the components under test behave as they do in jsdom without the stub. Call
// `unmockNarrowLayout` in afterEach.

import { mockMatchMedia, unmockMatchMedia } from '../test/matchMedia'
import { NARROW_LAYOUT_QUERY } from './useNarrowLayout'

export const mockNarrowLayout = (initial = true) => mockMatchMedia(initial, NARROW_LAYOUT_QUERY)

export const unmockNarrowLayout = unmockMatchMedia
