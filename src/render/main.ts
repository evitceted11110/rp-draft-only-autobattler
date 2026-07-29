import { connect } from '@rogue-paradise/platform-sdk'
import {
  chooseDraft,
  commitEncounter,
  createInitialState,
  enemies,
  getCurrentEnemy,
  getDirective,
  reorderLoadout,
  resolveEncounter,
  setLoadout,
  triggerNames,
  type Directive,
  type EffectType,
  type Enemy,
  type GameState,
  type TimelineEntry,
  type TimelineKind,
} from '../core/index.js'
import { theme } from '../visual/theme.js'
import './styles.css'

const rootElement = document.querySelector<HTMLElement>('#app')
if (rootElement === null) throw new Error('找不到 #app')
const root: HTMLElement = rootElement

const sdk = await connect({ gameSlug: 'draft-only-autobattler' })
const saved = await sdk.storage.get<GameState>('active-run-v1')
let state = isGameState(saved)
  ? saved
  : createInitialState(createSeed())
type BattlePresentation = {
  nextState: GameState
  frame: number
  speed: 1 | 2
  playing: boolean
}
let battlePresentation: BattlePresentation | null = null
let battleTimer: ReturnType<typeof setTimeout> | undefined

function createSeed(): string {
  return `oath-${Date.now().toString(36)}`
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<GameState>
  return (
    typeof candidate.seed === 'string' &&
    typeof candidate.phase === 'string' &&
    typeof candidate.encounterIndex === 'number' &&
    typeof candidate.resolve === 'number' &&
    Array.isArray(candidate.collection) &&
    Array.isArray(candidate.loadout) &&
    Array.isArray(candidate.draftOffer)
  )
}

const effectPresentation: Readonly<
  Record<EffectType, { glyph: string; label: string }>
> = {
  damage: { glyph: '✦', label: '直擊' },
  heal: { glyph: '✚', label: '修復' },
  guard: { glyph: '⬡', label: '護盾' },
  amplify_base: { glyph: '▲', label: '強化' },
  guard_and_damage: { glyph: '◈', label: '格擋反擊' },
  damage_per_round: { glyph: '⧖', label: '蓄時爆破' },
}

const triggerGlyphs = {
  opening: '▶',
  round_start: '↻',
  after_hit: '↯',
  self_below_half: '♥',
  enemy_below_half: '◇',
} as const

const enemyTierNames: Readonly<Record<Enemy['tier'], string>> = {
  normal: '一般',
  elite: '菁英',
  boss: '首領',
}

const timelineKindNames: Readonly<Record<TimelineKind, string>> = {
  round: '回合開始',
  trigger: '詞條觸發',
  attack: '敵方攻擊',
  damage: '玩家攻擊',
  objective: '契約判定',
}

function roundLabel(round: number): string {
  return round === 0 ? '開戰' : `第 ${round} 回合`
}

function displaySeed(seed: string): string {
  return seed.replace(/^oath-/, '誓約-')
}

function effectValue(directive: Directive): string {
  if (directive.effect === 'damage') return `-${directive.value} 敵方`
  if (directive.effect === 'heal') return `決心 +${directive.value}`
  if (directive.effect === 'guard') return `護盾 +${directive.value}`
  if (directive.effect === 'amplify_base') return `普攻 +${directive.value}`
  if (directive.effect === 'guard_and_damage') {
    return `盾 +${directive.value} / 反擊 ${directive.value}`
  }
  return `回合 × ${directive.value} 傷害`
}

function archetypeName(loadout: readonly Directive[]): string {
  const effects = loadout.map(({ effect }) => effect)
  const reactive = loadout.filter(
    ({ trigger }) =>
      trigger === 'after_hit' || trigger === 'self_below_half',
  ).length
  const burst = effects.filter(
    (effect) =>
      effect === 'damage' ||
      effect === 'damage_per_round' ||
      effect === 'guard_and_damage',
  ).length
  const sustain = effects.filter(
    (effect) =>
      effect === 'heal' ||
      effect === 'guard' ||
      effect === 'guard_and_damage',
  ).length
  if (reactive >= 2 && sustain >= 2) return '受擊反制流'
  if (burst >= 3) return '先手爆發流'
  if (sustain >= 3) return '高韌續航流'
  if (effects.includes('amplify_base')) return '普攻增幅流'
  return '條件連鎖流'
}

async function update(next: GameState): Promise<void> {
  state = next
  await sdk.storage.set('active-run-v1', state)
  render()
}

function directiveCard(id: string, index?: number): string {
  const directive = getDirective(id)
  const presentation = effectPresentation[directive.effect]
  const controls =
    index === undefined
      ? ''
      : `<div class="slot-controls">
          <button class="icon-button" data-move="${index}:-1" aria-label="上移 ${directive.name}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-button" data-move="${index}:1" aria-label="下移 ${directive.name}" ${index === 3 ? 'disabled' : ''}>↓</button>
        </div>`
  return `<article class="directive-card" data-trigger="${directive.trigger}" data-effect="${directive.effect}">
    <div class="card-topline">
      ${index === undefined ? '' : `<span class="slot-number">0${index + 1}</span>`}
      <span class="trigger"><i>${triggerGlyphs[directive.trigger]}</i>${triggerNames[directive.trigger]}</span>
      ${controls}
    </div>
    <h3>${directive.name}</h3>
    <div class="effect-diagram" aria-label="${triggerNames[directive.trigger]}時，${effectValue(directive)}">
      <span class="condition-node">${triggerGlyphs[directive.trigger]}</span>
      <span class="effect-arrow">→</span>
      <span class="effect-node"><i>${presentation.glyph}</i><strong>${effectValue(directive)}</strong></span>
    </div>
    <div class="effect-keywords"><span>${presentation.label}</span><span>每場一次</span></div>
    <p>${directive.description}</p>
  </article>`
}

function renderBuildPreview(): string {
  const enemy = getCurrentEnemy(state)
  const loadout = state.loadout.map(getDirective)
  const result = resolveEncounter(state.resolve, enemy, loadout)
  const triggerEntries = new Map(
    result.timeline
      .filter(
        (entry): entry is TimelineEntry & { directiveId: string } =>
          entry.kind === 'trigger' && entry.directiveId !== undefined,
      )
      .map((entry) => [entry.directiveId, entry]),
  )
  const chain = loadout
    .map((directive, index) => {
      const entry = triggerEntries.get(directive.id)
      const presentation = effectPresentation[directive.effect]
      return `<li class="${entry === undefined ? 'dormant' : 'fires'}">
        <span class="preview-order">${index + 1}</span>
        <span class="preview-glyph">${presentation.glyph}</span>
        <span class="preview-copy"><strong>${directive.name}</strong><small>${
          entry === undefined
            ? '本戰不會觸發'
            : `${roundLabel(entry.round)} · ${effectValue(directive)}`
        }</small></span>
      </li>`
    })
    .join('')
  return `<section class="build-preview" aria-label="目前構築的戰鬥預演">
    <div class="preview-heading">
      <div><span>流派預演</span><strong>${archetypeName(loadout)}</strong></div>
      <div class="forecast ${result.won ? 'win' : 'loss'}">
        <span>${result.won ? '預測成立' : '預測失敗'}</span>
        <strong>${result.resolve} / ${result.enemyHealth}</strong>
        <small>己方 / 敵方</small>
      </div>
    </div>
    <ol>${chain}</ol>
  </section>`
}

function renderPrepare(): string {
  const enemy = getCurrentEnemy(state)
  const attackCells = enemy.attacks
    .map(
      (attack, index) =>
        `<li><span>第 ${index + 1} 回合</span><strong>${attack}</strong></li>`,
    )
    .join('')
  const loadout = state.loadout
    .map((id, index) => directiveCard(id, index))
    .join('')
  const available = state.collection
    .filter((id) => !state.loadout.includes(id))
    .map(
      (id) =>
        `<button class="collection-card" data-equip="${id}">${directiveCard(id)}</button>`,
    )
    .join('')

  return `<section class="workspace">
    <section class="enemy-panel panel">
      <div class="eyebrow">公開契約 // ${enemyTierNames[enemy.tier]}</div>
      <div class="enemy-heading">
        <div>
          <h2>${enemy.name}</h2>
          <p class="objective">${enemy.objectiveText}</p>
        </div>
        <div class="enemy-health"><span>完整度</span><strong>${enemy.health}</strong></div>
      </div>
      <ol class="attack-script">${attackCells}</ol>
      ${renderBuildPreview()}
      <p class="readout">預演會依目前排序跑完整場。相同觸發條件只執行排在最前、尚未使用的詞條。</p>
    </section>

    <section class="loadout-panel">
      <div class="section-heading">
        <div>
          <div class="eyebrow">編譯佇列</div>
          <h2>四格誓約腳本</h2>
        </div>
        <span class="hint">↑ ↓ 改變事件優先序</span>
      </div>
      <div class="loadout">${loadout}</div>
      ${
        available.length === 0
          ? ''
          : `<div class="collection">
              <div class="collection-label">候補指令：先點候補，再點要替換的槽位</div>
              <div class="collection-grid">${available}</div>
            </div>`
      }
      <button class="commit-button" data-action="commit">
        <span>提交誓約</span>
        <small>提交後不可介入戰鬥</small>
      </button>
    </section>
  </section>`
}

function traceGlyph(entry: TimelineEntry): string {
  if (entry.kind === 'attack') return '←'
  if (entry.kind === 'damage') return '→'
  if (entry.kind === 'trigger') return '◆'
  if (entry.kind === 'objective') return '✓'
  return '•'
}

function renderTraceMap(): string {
  const result = state.lastResult
  if (result === undefined) return ''
  return `<ol class="trace-map" aria-label="完整戰鬥事件縮圖">
    ${result.timeline
      .map(
        (entry) => `<li data-kind="${entry.kind}" title="${entry.message}">
          <span>${roundLabel(entry.round)}</span>
          <strong>${traceGlyph(entry)}</strong>
          <small>${entry.playerResolve}/${entry.enemyHealth}</small>
        </li>`,
      )
      .join('')}
  </ol>`
}

function battleEntryClass(entry: TimelineEntry): string {
  if (entry.kind !== 'trigger' || entry.directiveId === undefined) {
    return entry.kind
  }
  const effect = getDirective(entry.directiveId).effect
  if (
    effect === 'damage' ||
    effect === 'damage_per_round' ||
    effect === 'guard_and_damage'
  ) {
    return 'player-strike'
  }
  if (effect === 'guard') return 'player-guard'
  if (effect === 'heal') return 'player-heal'
  return 'player-charge'
}

function renderCombatEffect(
  entry: TimelineEntry,
  previous: TimelineEntry | undefined,
): string {
  const resolveDelta =
    entry.playerResolve - (previous?.playerResolve ?? state.resolve)
  const enemyDelta =
    entry.enemyHealth -
    (previous?.enemyHealth ?? getCurrentEnemy(state).health)
  const guardDelta = entry.guard - (previous?.guard ?? 0)
  const directive =
    entry.directiveId === undefined ? undefined : getDirective(entry.directiveId)
  const presentation =
    directive === undefined ? undefined : effectPresentation[directive.effect]
  const glyph =
    presentation?.glyph ??
    (entry.kind === 'attack'
      ? '⚠'
      : entry.kind === 'damage'
        ? '✦'
        : entry.kind === 'objective'
          ? '✓'
          : '↻')
  const label =
    directive?.name ??
    (entry.kind === 'attack'
      ? '敵方攻擊'
      : entry.kind === 'damage'
        ? '基礎射擊'
        : entry.kind === 'objective'
          ? '契約判定'
          : `第 ${entry.round} 回合`)
  const deltas = [
    enemyDelta < 0
      ? `<span class="delta damage-delta">${enemyDelta} 敵方</span>`
      : '',
    resolveDelta > 0
      ? `<span class="delta heal-delta">決心 +${resolveDelta}</span>`
      : resolveDelta < 0
        ? `<span class="delta hurt-delta">決心 ${resolveDelta}</span>`
        : '',
    guardDelta > 0
      ? `<span class="delta guard-delta">護盾 +${guardDelta}</span>`
      : guardDelta < 0
        ? `<span class="delta guard-delta">護盾 ${guardDelta}</span>`
        : '',
    directive?.effect === 'amplify_base'
      ? `<span class="delta amplify-delta">普攻 +${directive.value}</span>`
      : '',
  ].join('')
  return `<div class="combat-fx" aria-live="polite">
    <span class="fx-rune">${glyph}</span>
    <div><small>${directive === undefined ? timelineKindNames[entry.kind] : presentation?.label}</small><strong>${label}</strong></div>
    <div class="delta-stack">${deltas}</div>
  </div>`
}

function renderBattleTheater(presentation: BattlePresentation): string {
  const result = presentation.nextState.lastResult
  if (result === undefined) throw new Error('戰鬥表演缺少結算結果')
  const enemy = getCurrentEnemy(state)
  const entry = result.timeline[presentation.frame]!
  const previous =
    presentation.frame === 0
      ? undefined
      : result.timeline[presentation.frame - 1]
  const visualClass = battleEntryClass(entry)
  const playerPercent = Math.max(
    0,
    Math.min(100, (entry.playerResolve / 20) * 100),
  )
  const enemyPercent = Math.max(
    0,
    Math.min(100, (entry.enemyHealth / enemy.health) * 100),
  )
  const activeDirective = entry.directiveId
  const script = enemy.attacks
    .map(
      (attack, index) => `<li class="${
        index + 1 < entry.round
          ? 'past'
          : index + 1 === entry.round
            ? 'active'
            : ''
      }">
        <span>第 ${index + 1} 回合</span><strong>${attack}</strong>
      </li>`,
    )
    .join('')
  const commandRail = state.loadout
    .map((id, index) => {
      const directive = getDirective(id)
      const effect = effectPresentation[directive.effect]
      return `<li class="${activeDirective === id ? 'active' : ''}">
        <span>0${index + 1}</span>
        <i class="rail-glyph">${effect.glyph}</i>
        <div><strong>${directive.name}</strong><small>${triggerGlyphs[directive.trigger]} ${triggerNames[directive.trigger]} · ${effectValue(directive)}</small></div>
      </li>`
    })
    .join('')
  const recent = result.timeline
    .slice(Math.max(0, presentation.frame - 3), presentation.frame + 1)
    .map(
      (item, index, items) => `<li class="${index === items.length - 1 ? 'current' : ''}">
        <span>${roundLabel(item.round)}</span>
        <p>${item.message}</p>
      </li>`,
    )
    .join('')
  const isLast = presentation.frame === result.timeline.length - 1

  return `<section class="battle-theater panel" data-visual="${visualClass}">
    <header class="battle-header">
      <div>
        <div class="eyebrow">決定性戰鬥 // ${enemy.objective === 'defeat' ? '擊破' : '存續'}</div>
        <h2>${enemy.name}</h2>
        <p>${enemy.objectiveText}</p>
      </div>
      <div class="battle-controls">
        <span class="frame-count">${presentation.frame + 1} / ${result.timeline.length}</span>
        ${
          isLast
            ? `<button class="battle-control primary" data-battle="finish">查看結果 →</button>`
            : `<button class="battle-control" data-battle="pause">${presentation.playing ? '暫停' : '繼續'}</button>
               <button class="battle-control" data-battle="speed">${presentation.speed}×</button>
               <button class="battle-control" data-battle="skip">跳過</button>`
        }
      </div>
    </header>

    <div class="battle-layout">
      <aside class="command-rail">
        <div class="eyebrow">誓約佇列</div>
        <ol>${commandRail}</ol>
      </aside>

      <div class="arena ${visualClass}">
        <div class="arena-grid" aria-hidden="true"></div>
        <div class="combatant player ${visualClass === 'attack' ? 'is-hit' : ''} ${visualClass.startsWith('player-') ? 'is-active' : ''}">
          <div class="combatant-label"><span>玩家</span><strong>誓約核心</strong></div>
          <div class="player-sigil">
            <span class="sigil-orbit"></span>
            <span class="sigil-core"></span>
            ${entry.guard > 0 ? `<span class="guard-shell"></span>` : ''}
          </div>
          <div class="vital-row"><span>決心</span><strong>${entry.playerResolve}</strong></div>
          <div class="vital-bar player-bar"><span style="width:${playerPercent}%"></span></div>
          <div class="guard-readout"><span>護盾</span><strong>${entry.guard}</strong></div>
        </div>

        <div class="impact-lane" aria-hidden="true">
          <span class="projectile"></span>
          <span class="impact-ring"></span>
          <span class="flow-line"></span>
        </div>
        ${renderCombatEffect(entry, previous)}

        <div class="combatant enemy ${visualClass === 'damage' || visualClass === 'player-strike' ? 'is-hit' : ''} ${visualClass === 'attack' ? 'is-active' : ''}">
          <div class="combatant-label"><span>${enemyTierNames[enemy.tier]}</span><strong>${enemy.name}</strong></div>
          <div class="enemy-sigil">
            <span></span><span></span><span></span>
          </div>
          <div class="vital-row"><span>完整度</span><strong>${entry.enemyHealth}</strong></div>
          <div class="vital-bar enemy-bar"><span style="width:${enemyPercent}%"></span></div>
          <div class="objective-badge">${enemy.objective === 'defeat' ? '擊破契約' : '存續契約'}</div>
        </div>

        <div class="action-banner" role="status" aria-live="polite">
          <span>${roundLabel(entry.round)}</span>
          <strong>${entry.message}</strong>
        </div>
      </div>

      <aside class="round-script">
        <div class="eyebrow">敵方腳本</div>
        <ol>${script}</ol>
      </aside>
    </div>

    <footer class="battle-footer">
      <ol class="visual-log">${recent}</ol>
      <div class="battle-legend">
        <span><i class="legend-player"></i>玩家作用</span>
        <span><i class="legend-enemy"></i>敵方作用</span>
        <span><i class="legend-guard"></i>護盾吸收</span>
      </div>
    </footer>
  </section>`
}

function renderDraft(): string {
  return `<section class="decision post-decision">
    <div class="eyebrow">戰後草稿</div>
    <h2>選一張指令加入收藏</h2>
    <p>下一場仍只能編譯四張；新指令會擴張可用腳本，而不是直接增加數值。</p>
    <div class="draft-grid">
      ${state.draftOffer
        .map(
          (id) =>
            `<button class="draft-choice" data-draft="${id}">${directiveCard(id)}<span>簽署此條款 →</span></button>`,
        )
        .join('')}
    </div>
  </section>`
}

function renderEnding(): string {
  const won = state.phase === 'victory'
  return `<section class="ending panel ${won ? 'ending-win' : 'ending-loss'}">
    <div class="eyebrow">${won ? '冒險認證完成' : '誓約遭到駁回'}</div>
    <h2>${won ? '七份契約全部成立' : `契約在第 ${state.encounterIndex + 1} 戰崩解`}</h2>
    <p>${won ? '你的四格腳本通過終局公證。' : '檢查追溯紀錄，找出讀錯的公開事件或被優先序吃掉的觸發。'}</p>
    <div class="ending-actions">
      <button class="secondary-button" data-action="replay">重播同一種子</button>
      <button class="commit-button compact" data-action="new-run"><span>開始新冒險</span></button>
    </div>
  </section>`
}

function renderPostBattle(): string {
  const result = state.lastResult
  if (result === undefined) return ''
  const enemy = enemies[state.encounterIndex]!
  const finalEntry = result.timeline[result.timeline.length - 1]!
  const playerPercent = Math.max(
    0,
    Math.min(100, (finalEntry.playerResolve / 20) * 100),
  )
  const enemyPercent = Math.max(
    0,
    Math.min(100, (finalEntry.enemyHealth / enemy.health) * 100),
  )
  return `<section class="post-battle-screen">
    <section class="result-overview panel">
      <div class="section-heading">
        <div>
          <div class="eyebrow">契約結算</div>
          <h2>${enemy.name}</h2>
        </div>
        <div class="result-chip ${result.won ? 'success' : 'failure'}">
          ${result.won ? '契約完成' : '契約失敗'}
        </div>
      </div>
      <p class="result-objective">${enemy.objectiveText}</p>
      <div class="result-vitals">
        <div>
          <div class="vital-row"><span>決心</span><strong>${finalEntry.playerResolve}</strong></div>
          <div class="vital-bar player-bar"><span style="width:${playerPercent}%"></span></div>
        </div>
        <div>
          <div class="vital-row"><span>敵方</span><strong>${finalEntry.enemyHealth}</strong></div>
          <div class="vital-bar enemy-bar"><span style="width:${enemyPercent}%"></span></div>
        </div>
        <div class="result-guard"><span>護盾</span><strong>${finalEntry.guard}</strong></div>
      </div>
      <div class="trace-heading">
        <div><span>完整事件圖</span><small>玩家/敵方剩餘值</small></div>
        <div class="mini-legend"><span>→ 玩家</span><span>← 敵方</span><span>◆ 指令</span></div>
      </div>
      ${renderTraceMap()}
      <p class="result-final-message">${finalEntry.message}</p>
    </section>
    <section class="post-action panel">
      ${state.phase === 'draft' ? renderDraft() : renderEnding()}
    </section>
  </section>`
}

function render(): void {
  if (battleTimer !== undefined) {
    clearTimeout(battleTimer)
    battleTimer = undefined
  }
  const progress = enemies
    .map(
      (_, index) =>
        `<span class="${index < state.encounterIndex ? 'cleared' : index === state.encounterIndex ? 'current' : ''}">${index + 1}</span>`,
    )
    .join('')

  root.style.setProperty('--bg', theme.background)
  root.style.setProperty('--panel', theme.panel)
  root.style.setProperty('--panel-raised', theme.panelRaised)
  root.style.setProperty('--fg', theme.foreground)
  root.style.setProperty('--muted', theme.muted)
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--danger', theme.danger)
  root.style.setProperty('--warning', theme.warning)

  const presentationEntry =
    battlePresentation?.nextState.lastResult?.timeline[
      battlePresentation.frame
    ]
  const displayedResolve =
    presentationEntry?.playerResolve ?? state.resolve

  const screenClass =
    battlePresentation !== null
      ? 'screen-battle'
      : state.phase === 'prepare'
        ? 'screen-prepare'
        : 'screen-post'

  root.innerHTML = `<div class="app-shell ${screenClass}">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">誓//約</span>
        <div><strong>誓約堆疊</strong><small>純草稿・自動結算隨機冒險</small></div>
      </div>
      <div class="run-id"><span>種子</span><code>${displaySeed(state.seed)}</code><small>${sdk.mode === 'embedded' ? '平台版' : '獨立版'}</small></div>
      <div class="run-meta">
        <div class="resolve"><span>決心</span><strong>${displayedResolve}<small>/20</small></strong></div>
        <div class="progress" aria-label="遭遇進度">${progress}</div>
      </div>
    </header>
    <main>
      ${
        battlePresentation === null
          ? `${state.phase === 'prepare' ? renderPrepare() : ''}
             ${state.phase !== 'prepare' ? renderPostBattle() : ''}`
          : renderBattleTheater(battlePresentation)
      }
    </main>
  </div>`

  bindEvents()
  scheduleBattleFrame()
}

let pendingEquip: string | null = null

function bindEvents(): void {
  root
    .querySelector<HTMLButtonElement>('[data-battle="pause"]')
    ?.addEventListener('click', () => {
      if (battlePresentation === null) return
      battlePresentation.playing = !battlePresentation.playing
      render()
    })
  root
    .querySelector<HTMLButtonElement>('[data-battle="speed"]')
    ?.addEventListener('click', () => {
      if (battlePresentation === null) return
      battlePresentation.speed =
        battlePresentation.speed === 1 ? 2 : 1
      render()
    })
  root
    .querySelector<HTMLButtonElement>('[data-battle="skip"]')
    ?.addEventListener('click', () => {
      if (battlePresentation === null) return
      const timeline =
        battlePresentation.nextState.lastResult?.timeline
      if (timeline === undefined) return
      battlePresentation.frame = timeline.length - 1
      battlePresentation.playing = false
      render()
    })
  root
    .querySelector<HTMLButtonElement>('[data-battle="finish"]')
    ?.addEventListener('click', () => {
      if (battlePresentation === null) return
      const nextState = battlePresentation.nextState
      battlePresentation = null
      void update(nextState)
    })
  root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const [fromText, deltaText] = button.dataset.move!.split(':')
      const from = Number(fromText)
      const to = from + Number(deltaText)
      void update(reorderLoadout(state, from, to))
    })
  })
  root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((button) => {
    button.addEventListener('click', () => {
      pendingEquip = button.dataset.equip!
      root
        .querySelectorAll('.collection-card')
        .forEach((card) => card.classList.remove('selected'))
      button.classList.add('selected')
      root
        .querySelectorAll<HTMLElement>('.loadout .directive-card')
        .forEach((card) => card.classList.add('replaceable'))
    })
  })
  root
    .querySelectorAll<HTMLElement>('.loadout .directive-card')
    .forEach((card, index) => {
      card.addEventListener('click', (event) => {
        if (
          pendingEquip === null ||
          (event.target as HTMLElement).closest('button') !== null
        ) {
          return
        }
        const next = [...state.loadout]
        next[index] = pendingEquip
        pendingEquip = null
        void update(setLoadout(state, next))
      })
    })
  root
    .querySelector<HTMLButtonElement>('[data-action="commit"]')
    ?.addEventListener('click', () => {
      battlePresentation = {
        nextState: commitEncounter(state),
        frame: 0,
        speed: 1,
        playing: true,
      }
      render()
    })
  root.querySelectorAll<HTMLButtonElement>('[data-draft]').forEach((button) => {
    button.addEventListener('click', () => {
      void update(chooseDraft(state, button.dataset.draft!))
    })
  })
  root
    .querySelector<HTMLButtonElement>('[data-action="replay"]')
    ?.addEventListener('click', () => {
      void update(createInitialState(state.seed))
    })
  root
    .querySelector<HTMLButtonElement>('[data-action="new-run"]')
    ?.addEventListener('click', () => {
      void update(createInitialState(createSeed()))
    })
}

function scheduleBattleFrame(): void {
  if (battlePresentation === null || !battlePresentation.playing) return
  const timeline =
    battlePresentation.nextState.lastResult?.timeline
  if (
    timeline === undefined ||
    battlePresentation.frame >= timeline.length - 1
  ) {
    battlePresentation.playing = false
    return
  }
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  const delay = reducedMotion
    ? 180
    : 760 / battlePresentation.speed
  battleTimer = setTimeout(() => {
    if (battlePresentation === null) return
    battlePresentation.frame += 1
    render()
  }, delay)
}

render()
