import { describe, expect, it } from 'vitest'
import { formatSelectionHash, historyModeFor, parseSelectionHash } from './selectionHash'
import type { Selection } from './selectionStore'

const known = { nodeIds: new Set(['nws-api', 'theme:weather', 'id with space']), taskIds: new Set(['local-forecast']) }
const none: Selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }
const node = (id: string): Selection => ({ ...none, selectedNodeId: id })
const task = (id: string): Selection => ({ ...none, selectedTaskId: id })
const point = (lon: number, lat: number): Selection => ({ ...none, selectedPoint: [lon, lat] })

describe('parseSelectionHash', () => {
  it('reads a node, a task and a point', () => {
    expect(parseSelectionHash('#node=nws-api', known)).toEqual(node('nws-api'))
    expect(parseSelectionHash('#node=theme%3Aweather', known)).toEqual(node('theme:weather'))
    expect(parseSelectionHash('#task=local-forecast', known)).toEqual(task('local-forecast'))
    expect(parseSelectionHash('#point=-97.09,39.75', known)).toEqual(point(-97.09, 39.75))
    expect(parseSelectionHash('#point=-97.09%2C39.75', known)).toEqual(point(-97.09, 39.75))
    expect(parseSelectionHash('#point=180,-90', known)).toEqual(point(180, -90))
  })

  it('ignores an empty hash, an unknown kind and an unknown id', () => {
    expect(parseSelectionHash('', known)).toBeNull()
    expect(parseSelectionHash('#', known)).toBeNull()
    expect(parseSelectionHash('#node=', known)).toBeNull()
    expect(parseSelectionHash('#nodes=nws-api', known)).toBeNull()
    expect(parseSelectionHash('#node=nope', known)).toBeNull()
    expect(parseSelectionHash('#task=nws-api', known)).toBeNull()
    expect(parseSelectionHash('#node=%E0%A4%A', known)).toBeNull()
  })

  it.each(['abc', '1,2,3', '1', '181,0', '0,-90.5', 'NaN,1', ',1', '1,', ' 1,2', '1e2,3', 'Infinity,0'])(
    'ignores the malformed point %j',
    (value) => {
      expect(parseSelectionHash(`#point=${value}`, known)).toBeNull()
    },
  )
})

describe('formatSelectionHash', () => {
  it('writes each kind, and nothing for no selection', () => {
    expect(formatSelectionHash(node('nws-api'))).toBe('#node=nws-api')
    expect(formatSelectionHash(node('theme:weather'))).toBe('#node=theme%3Aweather')
    expect(formatSelectionHash(task('local-forecast'))).toBe('#task=local-forecast')
    expect(formatSelectionHash(point(-97.0912345, 39.7500001))).toBe('#point=-97.0912,39.75')
    expect(formatSelectionHash(none)).toBe('')
  })

  it('round-trips through the parser', () => {
    for (const selection of [node('nws-api'), node('id with space'), task('local-forecast'), point(-97.0912, 39.75)]) {
      expect(parseSelectionHash(formatSelectionHash(selection), known)).toEqual(selection)
    }
  })
})

describe('historyModeFor', () => {
  it('pushes a node or task, so Back undoes it', () => {
    expect(historyModeFor('', node('nws-api'))).toBe('push')
    expect(historyModeFor('#node=nws-api', task('local-forecast'))).toBe('push')
  })

  it('replaces for a point or a clear, so history is not flooded', () => {
    expect(historyModeFor('#point=1,2', point(3, 4))).toBe('replace')
    expect(historyModeFor('', point(3, 4))).toBe('replace')
    expect(historyModeFor('#node=nws-api', none)).toBe('replace')
  })

  it('writes nothing when the hash already matches', () => {
    expect(historyModeFor('#node=nws-api', node('nws-api'))).toBe('none')
    expect(historyModeFor('#point=-97.0912,39.75', point(-97.09123, 39.75))).toBe('none')
    expect(historyModeFor('', none)).toBe('none')
  })
})
