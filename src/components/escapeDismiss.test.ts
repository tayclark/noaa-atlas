// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSelection, getSelectionSnapshot, selectNode, selectPoint } from '../data/selectionStore'
import { handleEscape, onEscapeKeyDown, registerDismisser, shouldHandleEscape } from './escapeDismiss'

const cleanups: (() => void)[] = []
const register = (fn: () => boolean) => cleanups.push(registerDismisser(fn))

afterEach(() => {
  cleanups.splice(0).forEach((remove) => remove())
  clearSelection()
  document.body.innerHTML = ''
})

const escapeOn = (target: EventTarget | null, extra: Partial<Parameters<typeof shouldHandleEscape>[0]> = {}) => ({
  key: 'Escape',
  defaultPrevented: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  target,
  ...extra,
})

describe('shouldHandleEscape', () => {
  it('takes a plain Escape on the page, a button or the map canvas', () => {
    document.body.innerHTML = '<button>b</button><canvas></canvas>'
    expect(shouldHandleEscape(escapeOn(document.body))).toBe(true)
    expect(shouldHandleEscape(escapeOn(document.querySelector('button')))).toBe(true)
    expect(shouldHandleEscape(escapeOn(document.querySelector('canvas')))).toBe(true)
    expect(shouldHandleEscape(escapeOn(null))).toBe(true)
  })

  it('leaves other keys, modified Escapes and ones already handled', () => {
    expect(shouldHandleEscape(escapeOn(document.body, { key: 'Enter' }))).toBe(false)
    expect(shouldHandleEscape(escapeOn(document.body, { defaultPrevented: true }))).toBe(false)
    expect(shouldHandleEscape(escapeOn(document.body, { altKey: true }))).toBe(false)
    expect(shouldHandleEscape(escapeOn(document.body, { ctrlKey: true }))).toBe(false)
    expect(shouldHandleEscape(escapeOn(document.body, { metaKey: true }))).toBe(false)
  })

  it('leaves fields and an open dialog to handle Escape themselves', () => {
    document.body.innerHTML = `
      <input /><textarea></textarea><select></select><div contenteditable="true"><b>x</b></div>
      <dialog open><button>in dialog</button></dialog><div contenteditable="false">ro</div>`
    for (const selector of ['input', 'textarea', 'select', '[contenteditable="true"] b', 'dialog button']) {
      expect(shouldHandleEscape(escapeOn(document.querySelector(selector))), selector).toBe(false)
    }
    expect(shouldHandleEscape(escapeOn(document.querySelector('[contenteditable="false"]')))).toBe(true)
  })
})

describe('handleEscape', () => {
  it('closes what is open before it clears the selection', () => {
    let popupOpen = true
    register(() => {
      if (!popupOpen) return false
      popupOpen = false
      return true
    })
    selectPoint([-97, 39])
    expect(handleEscape()).toBe(true)
    expect(popupOpen).toBe(false)
    expect(getSelectionSnapshot().selectedPoint).not.toBeNull()
    expect(handleEscape()).toBe(true)
    expect(getSelectionSnapshot().selectedPoint).toBeNull()
    expect(handleEscape()).toBe(false)
  })

  it('tries the newest dismisser first, and stops at the first that acts', () => {
    const older = vi.fn(() => true)
    const newer = vi.fn(() => true)
    register(older)
    register(newer)
    handleEscape()
    expect(newer).toHaveBeenCalledOnce()
    expect(older).not.toHaveBeenCalled()
  })

  it('forgets a dismisser once it is removed', () => {
    const dismiss = vi.fn(() => true)
    registerDismisser(dismiss)()
    selectNode('nws-api')
    handleEscape()
    expect(dismiss).not.toHaveBeenCalled()
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
  })
})

describe('onEscapeKeyDown', () => {
  it('marks the event handled only when it did something', () => {
    const idle = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    onEscapeKeyDown(idle)
    expect(idle.defaultPrevented).toBe(false)
    selectNode('nws-api')
    const acting = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    onEscapeKeyDown(acting)
    expect(acting.defaultPrevented).toBe(true)
  })
})
