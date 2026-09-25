// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import graphJson from '../../data/graph.json'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile } from '../../data/graphSchema'
import { getPoint } from '../../data/nwsClient'
import { getPlanetaryKp } from '../../data/swpcClient'
import { NodeSampleSection } from './NodeSampleSection'

vi.mock('../../data/nwsClient', () => ({ getPoint: vi.fn() }))
vi.mock('../../data/swpcClient', () => ({ getPlanetaryKp: vi.fn() }))

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const nwsApi = nodes.find((n) => n.id === 'nws-api') as ServiceNode
const kpNode = nodes.find((n) => n.id === 'swpc-geomagnetic-indices') as ServiceNode
const notLive = nodes.find((n) => !n.liveLayer) as ServiceNode

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.mocked(getPoint).mockReset()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

describe('graph.json samples', () => {
  it('gives every node a sample', () => {
    for (const node of nodes) expect(node.sample, node.id).toBeTruthy()
  })

  it('keeps the runnable nws-api sample url in sync with the coordinates the button fetches', () => {
    expect(nwsApi.sample?.url).toBe('https://api.weather.gov/points/39.7456,-97.0892')
  })

  it('keeps the runnable Kp sample url on the file getPlanetaryKp fetches (#54)', () => {
    expect(kpNode.sample?.url).toBe('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
  })
})

describe('NodeSampleSection', () => {
  it('renders nothing for a node without a sample', () => {
    const { container } = render(<NodeSampleSection node={{ ...notLive, sample: undefined }} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a static sample with copy buttons but no run button for a non-live node', () => {
    render(<NodeSampleSection node={notLive} />)
    expect(screen.getByText('Static sample')).toBeTruthy()
    expect(screen.getByText(`GET ${notLive.sample?.url}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /run sample/i })).toBeNull()
  })

  it('copies the sample as curl and fetch', () => {
    render(<NodeSampleSection node={nwsApi} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy as curl' }))
    expect(writeText).toHaveBeenLastCalledWith(`curl -H 'Accept: application/geo+json' '${nwsApi.sample?.url}'`)
    fireEvent.click(screen.getByRole('button', { name: 'Copy as fetch' }))
    expect(writeText.mock.lastCall?.[0]).toContain(`fetch("${nwsApi.sample?.url}"`)
  })

  it('runs the live sample and shows the response', async () => {
    vi.mocked(getPoint).mockResolvedValue({ gridId: 'TOP' } as never)
    render(<NodeSampleSection node={nwsApi} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run sample' }))
    await waitFor(() => expect(screen.getByText('Live response (parsed)')).toBeTruthy())
    expect(getPoint).toHaveBeenCalledWith(39.7456, -97.0892)
    expect(screen.getByText(/"gridId": "TOP"/)).toBeTruthy()
  })

  it('runs the live Kp sample through the SWPC client (#54)', async () => {
    vi.mocked(getPlanetaryKp).mockResolvedValue([{ time_tag: '2026-09-25T01:13:00', kp_index: 3, estimated_kp: 3 }])
    render(<NodeSampleSection node={kpNode} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run sample' }))
    await waitFor(() => expect(screen.getByText('Live response (parsed)')).toBeTruthy())
    expect(screen.getByText(/"estimated_kp": 3/)).toBeTruthy()
  })

  it('shows an error and keeps the static sample when the live call fails', async () => {
    vi.mocked(getPoint).mockRejectedValue(new Error('boom'))
    render(<NodeSampleSection node={nwsApi} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run sample' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'))
    expect(screen.getByText('Static sample')).toBeTruthy()
  })
})
