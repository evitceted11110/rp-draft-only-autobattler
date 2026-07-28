import { describe, expect, it } from 'vitest'
import { runLiveCore, summarizeLiveCore } from './live-core.js'

describe('live core simulation', () => {
  it('同 seed 的正式 core 模擬完全一致', () => {
    expect(runLiveCore(100, 'same-seed')).toEqual(
      runLiveCore(100, 'same-seed'),
    )
  })

  it('能產生四種策略的摘要', () => {
    const summary = summarizeLiveCore(400, 'summary')

    expect(Object.keys(summary.strategyWinRate).sort()).toEqual([
      'adaptive',
      'assault',
      'fortress',
      'threshold',
    ])
    expect(summary.clearStats.count).toBe(400)
  })
})
