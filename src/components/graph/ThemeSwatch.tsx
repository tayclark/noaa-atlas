// The dot of a theme's colour beside its name in the theme and root detail bodies (#145, #148).

import type { Theme } from '../../data/graphSchema'
import { THEME_COLORS } from '../../data/themeColors'

export function ThemeSwatch({ theme }: { theme: Theme }) {
  return <span className="node-detail-theme-swatch" style={{ background: THEME_COLORS[theme] }} aria-hidden="true" />
}
