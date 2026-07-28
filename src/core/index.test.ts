import { describe, expect, it } from 'vitest'
import {
  chooseDraft,
  commitEncounter,
  createInitialState,
  directives,
  enemies,
  reorderLoadout,
  resolveEncounter,
  setLoadout,
} from './index.js'

describe('run state', () => {
  it('用 seed 建立可重播的第一場準備狀態', () => {
    const state = createInitialState('demo-seed')

    expect(state.phase).toBe('prepare')
    expect(state.encounterIndex).toBe(0)
    expect(state.resolve).toBe(20)
    expect(state.loadout).toHaveLength(4)
    expect(state.collection).toEqual(state.loadout)
  })

  it('同 seed 與同 loadout 產生逐 tick 相同結果', () => {
    const first = commitEncounter(createInitialState('repeatable'))
    const second = commitEncounter(createInitialState('repeatable'))

    expect(first.lastResult).toEqual(second.lastResult)
    expect(first.draftOffer).toEqual(second.draftOffer)
  })

  it('可以改變四格腳本的優先序', () => {
    const state = createInitialState('priority')
    const reordered = reorderLoadout(state, 0, 3)

    expect(reordered.loadout).toEqual([
      state.loadout[1],
      state.loadout[2],
      state.loadout[3],
      state.loadout[0],
    ])
    expect(state.loadout).not.toEqual(reordered.loadout)
  })

  it('只能裝備收藏內四張不同指令', () => {
    const state = {
      ...createInitialState('loadout'),
      collection: directives.slice(0, 6).map(({ id }) => id),
    }
    const next = setLoadout(
      state,
      directives.slice(1, 5).map(({ id }) => id),
    )

    expect(next.loadout).toEqual(
      directives.slice(1, 5).map(({ id }) => id),
    )
    expect(() => setLoadout(state, ['first-word'])).toThrow()
  })

  it('草稿選擇會加入收藏並推進遭遇', () => {
    const afterBattle = commitEncounter(createInitialState('draft-flow'))
    expect(afterBattle.phase).toBe('draft')

    const offered = afterBattle.draftOffer[0]
    expect(offered).toBeDefined()
    const next = chooseDraft(afterBattle, offered!)

    expect(next.phase).toBe('prepare')
    expect(next.encounterIndex).toBe(1)
    expect(next.collection).toContain(offered)
  })
})

describe('encounter resolution', () => {
  it('撐過型契約不要求擊殺敵人', () => {
    const defensive = [
      'stone-protocol',
      'reserve-spark',
      'mercy-loop',
      'harvest-logic',
    ].map((id) => directives.find((directive) => directive.id === id)!)
    const enemy = {
      ...enemies[1]!,
      health: 999,
      objective: 'endure' as const,
    }

    const result = resolveEncounter(20, enemy, defensive)

    expect(result.won).toBe(true)
    expect(result.enemyHealth).toBeGreaterThan(0)
    expect(result.timeline.some(({ kind }) => kind === 'objective')).toBe(true)
  })

  it('時間線會指出觸發的指令與每次生命變化', () => {
    const state = createInitialState('timeline')
    const result = resolveEncounter(
      state.resolve,
      enemies[0]!,
      state.loadout.map(
        (id) => directives.find((directive) => directive.id === id)!,
      ),
    )

    expect(result.timeline.some(({ directiveId }) => directiveId)).toBe(true)
    expect(
      result.timeline.every(
        ({ playerResolve, enemyHealth }) =>
          Number.isFinite(playerResolve) && Number.isFinite(enemyHealth),
      ),
    ).toBe(true)
  })
})
