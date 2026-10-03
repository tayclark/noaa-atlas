// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphSearch, type SearchResult } from './GraphSearch'

afterEach(cleanup)

const results: SearchResult[] = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, name: `Service ${i}`, detail: 'Weather & forecast' }))

function Harness({ onPick = () => {}, withResults = true }: { onPick?: (id: string) => void; withResults?: boolean }) {
  const [query, setQuery] = useState('')
  return (
    <>
      <GraphSearch
        query={query}
        onQueryChange={setQuery}
        matchCount={query ? results.length : null}
        {...(withResults ? { results, onPick } : {})}
      />
      <button type="button">elsewhere</button>
    </>
  )
}

const box = () => screen.getByRole('searchbox', { name: 'Search graph' }) as HTMLInputElement

describe('GraphSearch', () => {
  it('asks a phone keyboard for a search key, without capitals, corrections or suggestions', () => {
    render(<Harness />)
    expect(box().getAttribute('enterkeyhint')).toBe('search')
    expect(box().getAttribute('autocapitalize')).toBe('off')
    expect(box().getAttribute('autocomplete')).toBe('off')
    expect(box().getAttribute('spellcheck')).toBe('false')
  })

  it('reports focus, so the page can start loading the dataset rows (#269)', () => {
    const onFocus = vi.fn()
    render(<GraphSearch query="" onQueryChange={() => {}} onFocus={onFocus} matchCount={null} />)
    box().focus()
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('shows a clear button only while there is something to clear, and refocuses the box', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    fireEvent.change(box(), { target: { value: 'nws' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box().value).toBe('')
    expect(document.activeElement).toBe(box())
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('clears on Escape', () => {
    render(<Harness />)
    fireEvent.change(box(), { target: { value: 'nws' } })
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(box().value).toBe('')
  })

  it('lists no matches unless it is given some', () => {
    render(<Harness withResults={false} />)
    fireEvent.change(box(), { target: { value: 'nws' } })
    expect(screen.queryByRole('list', { name: 'Matching services' })).toBeNull()
  })

  it('lists at most six matches by name, while the status still counts them all', () => {
    render(<Harness />)
    fireEvent.change(box(), { target: { value: 'service' } })
    const list = screen.getByRole('list', { name: 'Matching services' })
    expect(list.querySelectorAll('li')).toHaveLength(6)
    expect(screen.getByRole('status').textContent).toBe('8 matches')
    expect(screen.getByText('Service 0')).toBeTruthy()
    expect(screen.queryByText('Service 6')).toBeNull()
  })

  it('picks a match, closing the list and putting the keyboard away', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    fireEvent.change(box(), { target: { value: 'service' } })
    box().focus()
    fireEvent.click(screen.getByRole('button', { name: /Service 2/ }))
    expect(onPick).toHaveBeenCalledWith('n2')
    expect(screen.queryByRole('list', { name: 'Matching services' })).toBeNull()
    expect(document.activeElement).not.toBe(box())
  })

  it('closes on a tap outside, and opens again as the query changes', () => {
    render(<Harness />)
    fireEvent.change(box(), { target: { value: 'service' } })
    expect(screen.getByRole('list', { name: 'Matching services' })).toBeTruthy()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('list', { name: 'Matching services' })).toBeNull()

    fireEvent.change(box(), { target: { value: 'service 1' } })
    expect(screen.getByRole('list', { name: 'Matching services' })).toBeTruthy()
  })

  it('stays open for a press inside the search box', () => {
    render(<Harness />)
    fireEvent.change(box(), { target: { value: 'service' } })
    fireEvent.pointerDown(screen.getByRole('button', { name: /Service 1/ }))
    expect(screen.getByRole('list', { name: 'Matching services' })).toBeTruthy()
  })

  it('reports no matches without listing any', () => {
    render(
      <GraphSearch query="zzz" onQueryChange={() => {}} matchCount={0} results={[]} onPick={() => {}} />,
    )
    expect(screen.getByRole('status').textContent).toBe('No matches for "zzz"')
    expect(screen.queryByRole('list', { name: 'Matching services' })).toBeNull()
  })
})
