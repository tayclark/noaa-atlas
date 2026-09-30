// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { datasetsForService } from '../../data/nceiDatasets'
import { NodeDatasetsSection } from './NodeDatasetsSection'

afterEach(cleanup)

describe('NodeDatasetsSection', () => {
  it('lists the datasets of an NCEI service with a count and links', () => {
    const count = datasetsForService('ncei-access-data-service').length
    render(<NodeDatasetsSection serviceId="ncei-access-data-service" />)
    expect(screen.getByRole('region', { name: 'Datasets' })).toBeTruthy()
    expect(screen.getByText(`Datasets (${count})`)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(count)
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('renders nothing for a service without datasets', () => {
    const { container } = render(<NodeDatasetsSection serviceId="nws-api" />)
    expect(container.innerHTML).toBe('')
  })
})
