// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ComparePanel } from './ComparePanel'
import { addCompare, clearCompare, getCompareSnapshot } from '../data/compareStore'
import graphJson from '../data/graph.json'
import { parseGraphFile } from '../data/graphSchema'

const services = parseGraphFile(graphJson).nodes.filter((n) => n.kind === 'service')

beforeEach(clearCompare)
afterEach(cleanup)

describe('ComparePanel', () => {
  it('asks for at least two services until there are two', () => {
    render(<ComparePanel />)
    expect(screen.getByText(/Pick at least two services/)).toBeTruthy()
    act(() => addCompare([services[0]!.id]))
    expect(screen.getByText(/Pick at least two services/)).toBeTruthy()
    expect(screen.getByRole('button', { name: `Remove ${services[0]!.name} from compare` })).toBeTruthy()
  })

  it('shows a column per service and a row per field', () => {
    act(() => addCompare([services[0]!.id, services[1]!.id]))
    render(<ComparePanel />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    for (const label of ['Auth', 'Formats', 'Coverage', 'Freshness']) {
      expect(screen.getByRole('rowheader', { name: label })).toBeTruthy()
    }
  })

  it('removes one column and clears all', () => {
    act(() => addCompare([services[0]!.id, services[1]!.id, services[2]!.id]))
    render(<ComparePanel />)
    fireEvent.click(screen.getByRole('button', { name: `Remove ${services[0]!.name} from compare` }))
    expect(getCompareSnapshot()).toEqual([services[1]!.id, services[2]!.id])
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(getCompareSnapshot()).toEqual([])
    expect(screen.getByText(/Pick at least two services/)).toBeTruthy()
  })
})
