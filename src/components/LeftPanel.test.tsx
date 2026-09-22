// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LeftPanel } from './LeftPanel'
import { clearRequestLog } from '../data/requestLog'

beforeEach(() => {
  clearRequestLog()
})

afterEach(cleanup)

describe('LeftPanel', () => {
  it('defaults to the Inspector tab', () => {
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: 'Inspector', selected: true })).toBeTruthy()
    expect(screen.getByText('No live requests yet.')).toBeTruthy()
  })

  it('switches to the Graph tab and back', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
    expect(screen.getByText('No live requests yet.')).toBeTruthy()
  })
})
