import { connect } from '@rogue-paradise/platform-sdk'
import {
  chooseDraft,
  commitEncounter,
  createInitialState,
  enemies,
  getCurrentEnemy,
  getDirective,
  reorderLoadout,
  setLoadout,
  triggerNames,
  type GameState,
  type TimelineEntry,
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

async function update(next: GameState): Promise<void> {
  state = next
  await sdk.storage.set('active-run-v1', state)
  render()
}

function directiveCard(id: string, index?: number): string {
  const directive = getDirective(id)
  const controls =
    index === undefined
      ? ''
      : `<div class="slot-controls">
          <button class="icon-button" data-move="${index}:-1" aria-label="上移 ${directive.name}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-button" data-move="${index}:1" aria-label="下移 ${directive.name}" ${index === 3 ? 'disabled' : ''}>↓</button>
        </div>`
  return `<article class="directive-card" data-trigger="${directive.trigger}">
    <div class="card-topline">
      ${index === undefined ? '' : `<span class="slot-number">0${index + 1}</span>`}
      <span class="trigger">${triggerNames[directive.trigger]}</span>
      ${controls}
    </div>
    <h3>${directive.name}</h3>
    <p>${directive.description}</p>
  </article>`
}

function renderPrepare(): string {
  const enemy = getCurrentEnemy(state)
  const attackCells = enemy.attacks
    .map(
      (attack, index) =>
        `<li><span>R${index + 1}</span><strong>${attack}</strong></li>`,
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
      <div class="eyebrow">公開契約 // ${enemy.tier.toUpperCase()}</div>
      <div class="enemy-heading">
        <div>
          <h2>${enemy.name}</h2>
          <p class="objective">${enemy.objectiveText}</p>
        </div>
        <div class="enemy-health"><span>完整度</span><strong>${enemy.health}</strong></div>
      </div>
      <ol class="attack-script">${attackCells}</ol>
      <p class="readout">攻擊腳本完全公開。guard 先吸收傷害；同一事件只會觸發最前方仍有 charge 的指令。</p>
    </section>

    <section class="loadout-panel">
      <div class="section-heading">
        <div>
          <div class="eyebrow">COMPILE QUEUE</div>
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

function renderTimeline(): string {
  const result = state.lastResult
  if (result === undefined) return ''
  return `<section class="timeline panel">
    <div class="section-heading">
      <div>
        <div class="eyebrow">DETERMINISTIC TRACE</div>
        <h2>戰鬥追溯</h2>
      </div>
      <div class="result-chip ${result.won ? 'success' : 'failure'}">
        ${result.won ? '契約完成' : '契約失敗'}
      </div>
    </div>
    <ol>
      ${result.timeline
        .map(
          (entry) => `<li data-kind="${entry.kind}">
            <span class="tick">${entry.round === 0 ? 'OP' : `R${entry.round}`}</span>
            <p>${entry.message}</p>
            <span class="snapshot">你 ${entry.playerResolve} · 敵 ${entry.enemyHealth} · 盾 ${entry.guard}</span>
          </li>`,
        )
        .join('')}
    </ol>
  </section>`
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

function renderBattleTheater(presentation: BattlePresentation): string {
  const result = presentation.nextState.lastResult
  if (result === undefined) throw new Error('戰鬥表演缺少結算結果')
  const enemy = getCurrentEnemy(state)
  const entry = result.timeline[presentation.frame]!
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
        <span>R${index + 1}</span><strong>${attack}</strong>
      </li>`,
    )
    .join('')
  const commandRail = state.loadout
    .map((id, index) => {
      const directive = getDirective(id)
      return `<li class="${activeDirective === id ? 'active' : ''}">
        <span>0${index + 1}</span>
        <div><strong>${directive.name}</strong><small>${triggerNames[directive.trigger]}</small></div>
      </li>`
    })
    .join('')
  const recent = result.timeline
    .slice(Math.max(0, presentation.frame - 3), presentation.frame + 1)
    .map(
      (item, index, items) => `<li class="${index === items.length - 1 ? 'current' : ''}">
        <span>${item.round === 0 ? 'OP' : `R${item.round}`}</span>
        <p>${item.message}</p>
      </li>`,
    )
    .join('')
  const isLast = presentation.frame === result.timeline.length - 1

  return `<section class="battle-theater panel" data-visual="${visualClass}">
    <header class="battle-header">
      <div>
        <div class="eyebrow">DETERMINISTIC COMBAT // ${enemy.objective.toUpperCase()}</div>
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
          <div class="combatant-label"><span>YOU</span><strong>誓約核心</strong></div>
          <div class="player-sigil">
            <span class="sigil-orbit"></span>
            <span class="sigil-core"></span>
            ${entry.guard > 0 ? `<span class="guard-shell"></span>` : ''}
          </div>
          <div class="vital-row"><span>RESOLVE</span><strong>${entry.playerResolve}</strong></div>
          <div class="vital-bar player-bar"><span style="width:${playerPercent}%"></span></div>
          <div class="guard-readout"><span>GUARD</span><strong>${entry.guard}</strong></div>
        </div>

        <div class="impact-lane" aria-hidden="true">
          <span class="projectile"></span>
          <span class="impact-ring"></span>
          <span class="flow-line"></span>
        </div>

        <div class="combatant enemy ${visualClass === 'damage' || visualClass === 'player-strike' ? 'is-hit' : ''} ${visualClass === 'attack' ? 'is-active' : ''}">
          <div class="combatant-label"><span>${enemy.tier.toUpperCase()}</span><strong>${enemy.name}</strong></div>
          <div class="enemy-sigil">
            <span></span><span></span><span></span>
          </div>
          <div class="vital-row"><span>INTEGRITY</span><strong>${entry.enemyHealth}</strong></div>
          <div class="vital-bar enemy-bar"><span style="width:${enemyPercent}%"></span></div>
          <div class="objective-badge">${enemy.objective === 'defeat' ? '擊破契約' : '存續契約'}</div>
        </div>

        <div class="action-banner" role="status" aria-live="polite">
          <span>${entry.round === 0 ? 'OPENING' : `ROUND ${entry.round}`}</span>
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
  return `<section class="decision panel">
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
    <div class="eyebrow">${won ? 'RUN CERTIFIED' : 'OATH REJECTED'}</div>
    <h2>${won ? '七份契約全部成立' : `契約在第 ${state.encounterIndex + 1} 戰崩解`}</h2>
    <p>${won ? '你的四格腳本通過終局公證。' : '檢查追溯紀錄，找出讀錯的公開事件或被優先序吃掉的觸發。'}</p>
    <div class="ending-actions">
      <button class="secondary-button" data-action="replay">重播同一 seed</button>
      <button class="commit-button compact" data-action="new-run"><span>開始新 run</span></button>
    </div>
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

  root.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">O//S</span>
        <div><strong>誓約堆疊</strong><small>純草稿・自動結算 Roguelike</small></div>
      </div>
      <div class="run-meta">
        <div class="resolve"><span>RESOLVE</span><strong>${displayedResolve}<small>/20</small></strong></div>
        <div class="progress" aria-label="遭遇進度">${progress}</div>
      </div>
    </header>
    <main>
      <div class="seed-row"><span>SEED</span><code>${state.seed}</code><span>${sdk.mode === 'embedded' ? 'PLATFORM' : 'STANDALONE'}</span></div>
      ${
        battlePresentation === null
          ? `${state.phase === 'prepare' ? renderPrepare() : ''}
             ${state.phase !== 'prepare' ? renderTimeline() : state.lastResult === undefined ? '' : `<details class="previous-trace"><summary>查看上一場追溯</summary>${renderTimeline()}</details>`}
             ${state.phase === 'draft' ? renderDraft() : ''}
             ${state.phase === 'victory' || state.phase === 'defeat' ? renderEnding() : ''}`
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
