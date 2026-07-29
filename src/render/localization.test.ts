import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const visibleSource = [
  readFileSync(new URL('./main.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../index.html', import.meta.url), 'utf8'),
  readFileSync(new URL('../../game.json', import.meta.url), 'utf8'),
].join('\n')

describe('繁體中文介面', () => {
  it('不會重新露出已翻譯的英文 HUD 詞彙', () => {
    expect(visibleSource).not.toMatch(
      /\b(?:BUILD PREVIEW|COMPILE QUEUE|CONTRACT RESULT|DETERMINISTIC COMBAT|RESOLVE|GUARD|INTEGRITY|OPENING|ROUND|RUN CERTIFIED|OATH REJECTED|SEED|PLATFORM|STANDALONE|Roguelike)\b/,
    )
  })

  it('使用統一的中文資源名稱', () => {
    expect(visibleSource).toContain('決心')
    expect(visibleSource).toContain('護盾')
    expect(visibleSource).toContain('完整度')
    expect(visibleSource).toContain('流派預演')
  })
})
