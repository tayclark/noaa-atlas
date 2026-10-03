// The static page shell and link-preview metadata in index.html (#271). React replaces the shell on
// mount, so nothing at runtime checks it; this keeps the tags, the shell and the assets they name
// from quietly going missing.

import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import { NARROW_LAYOUT_QUERY } from './components/useNarrowLayout'

const PUBLIC_FILES = Object.keys(import.meta.glob('/public/*', { query: '?url', import: 'default' })).map((path) =>
  path.replace('/public/', ''),
)

function meta(attr: 'name' | 'property', key: string): string | undefined {
  return html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]
}

describe('index.html', () => {
  it('paints a header and a loading status inside #root before the bundle runs', () => {
    const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)?.[1] ?? ''
    expect(root).toContain('class="app-shell-title">NOAA Atlas<')
    expect(root).toMatch(/role="status">Loading the atlas/)
    expect(root).toContain('<noscript>')
  })

  it('hides the shell header where the phone layout hides its own: compact and landscape', () => {
    const query = NARROW_LAYOUT_QUERY.split(', ')
      .map((part) => `${part} and (orientation: landscape)`)
      .join(', ')
    expect(html).toContain(`@media ${query} {`)
  })

  it('has a description and link-preview tags with absolute URLs', () => {
    expect(meta('name', 'description')).toBeTruthy()
    for (const key of ['og:title', 'og:description', 'og:site_name', 'og:image:alt']) expect(meta('property', key)).toBeTruthy()
    expect(meta('property', 'og:url')).toMatch(/^https:\/\//)
    expect(meta('property', 'og:image')).toMatch(/^https:\/\/.+\/og-image\.png$/)
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
  })

  it('names only files that public/ has', () => {
    const named = [...html.matchAll(/%BASE_URL%([\w.-]+)/g)].map((m) => m[1])
    const ogImage = meta('property', 'og:image')?.split('/').pop()
    expect(named).toEqual(expect.arrayContaining(['favicon.svg', 'apple-touch-icon.png', 'manifest.webmanifest']))
    for (const file of [...named, ogImage]) expect(PUBLIC_FILES).toContain(file)
  })
})
