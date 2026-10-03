// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDatasetCatalog } from '../../data/nceiDatasets'
import { NodeDatasetsSection } from './NodeDatasetsSection'

afterEach(cleanup)

describe('NodeDatasetsSection', () => {
  // Runs first, while the module's catalog is still unloaded.
  it('loads the rows on mount and lists the datasets of an NCEI service with a count and links (#269)', async () => {
    render(<NodeDatasetsSection serviceId="ncei-access-data-service" />)
    expect(screen.queryByRole('region', { name: 'Datasets' })).toBeNull()
    const count = (await loadDatasetCatalog()).forService('ncei-access-data-service').length
    expect(await screen.findByRole('region', { name: 'Datasets' })).toBeTruthy()
    expect(screen.getByText(`Datasets (${count})`)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(count)
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('renders nothing for a service without datasets', async () => {
    await act(() => loadDatasetCatalog())
    const { container } = render(<NodeDatasetsSection serviceId="nws-api" />)
    expect(container.innerHTML).toBe('')
  })
})
