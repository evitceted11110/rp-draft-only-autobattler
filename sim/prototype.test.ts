import { describe, expect, it } from 'vitest'
import {
  directives,
  resolveEncounter,
  runPrototype,
  summarizePrototype,
} from './prototype.js'

describe('紙上規則原型', () => {
  it('相同 seed 產生完全相同的模擬摘要', () => {
    expect(summarizePrototype(500, 'replay-check')).toEqual(
      summarizePrototype(500, 'replay-check'),
    )
  })

  it('腳本優先序會改變同一場戰鬥結果', () => {
    const afterHit = directives.filter(
      ({ id }) => id === 'stone-protocol' || id === 'mirrored-debt',
    )
    const enemy = {
      id: 'priority-proof',
      health: 11,
      attacks: [6, 6],
    }

    expect(resolveEncounter(20, enemy, afterHit)).not.toEqual(
      resolveEncounter(20, enemy, [...afterHit].reverse()),
    )
  })

  it('能執行多局並保留每局結果', () => {
    const report = runPrototype(1_000)
    expect(report.results).toHaveLength(1_000)
    expect(report.results.every(({ encountersCleared }) => encountersCleared >= 0))
      .toBe(true)
  })
})
