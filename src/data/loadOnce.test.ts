import { describe, expect, it, vi } from 'vitest'
import { loadOnce } from './loadOnce'

describe('loadOnce', () => {
  it('runs the load once and shares its result', async () => {
    const load = vi.fn(async () => 42)
    const get = loadOnce(load)
    expect(await Promise.all([get(), get()])).toEqual([42, 42])
    expect(await get()).toBe(42)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('forgets a failure, so the next call retries', async () => {
    const load = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(7)
    const get = loadOnce(load)
    await expect(get()).rejects.toThrow('offline')
    expect(await get()).toBe(7)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
