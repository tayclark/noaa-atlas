// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

const TEXT = "curl 'https://api.weather.gov/alerts/active'"
const FAILED = 'Copy failed. Copy it from the box below.'

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CopyButton', () => {
  it('mounts an empty live region before any click', () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton label="Copy as curl" text={TEXT} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('copies, confirms, then clears the confirmation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton label="Copy as curl" text={TEXT} />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as curl' })))
    expect(writeText).toHaveBeenCalledWith(TEXT)
    expect(screen.getByRole('status').textContent).toBe('Copied')
    expect(screen.getByRole('button', { name: 'Copy as curl' }).textContent).toBe('Copy as curl')
    expect(screen.queryByRole('textbox')).toBeNull()

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('restarts the confirmation timer on a second copy', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton label="Copy as curl" text={TEXT} />)
    const button = screen.getByRole('button', { name: 'Copy as curl' })

    await act(async () => fireEvent.click(button))
    act(() => vi.advanceTimersByTime(1500))
    await act(async () => fireEvent.click(button))
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByRole('status').textContent).toBe('Copied')
  })

  it('says so on a rejection and reveals the text, focused and selected', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')))
    render(<CopyButton label="Copy as curl" text={TEXT} />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as curl' })))
    expect(screen.getByRole('status').textContent).toBe(FAILED)
    const fallback = screen.getByRole('textbox', { name: 'Copy as curl text' }) as HTMLTextAreaElement
    expect(fallback.value).toBe(TEXT)
    expect(document.activeElement).toBe(fallback)
    expect(fallback.selectionStart).toBe(0)
    expect(fallback.selectionEnd).toBe(TEXT.length)
  })

  it('treats a missing clipboard API as a failure', async () => {
    stubClipboard(undefined)
    render(<CopyButton label="Copy as fetch" text={TEXT} />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy as fetch' })))
    expect(screen.getByRole('status').textContent).toBe(FAILED)
    expect((screen.getByRole('textbox', { name: 'Copy as fetch text' }) as HTMLTextAreaElement).value).toBe(TEXT)
  })

  it('hides the fallback once a retry succeeds', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton label="Copy as curl" text={TEXT} />)
    const button = screen.getByRole('button', { name: 'Copy as curl' })

    await act(async () => fireEvent.click(button))
    expect(screen.queryByRole('textbox')).not.toBeNull()
    await act(async () => fireEvent.click(button))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Copied')
  })
})
