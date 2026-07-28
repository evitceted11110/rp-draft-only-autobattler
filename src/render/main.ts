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

  root.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">O//S</span>
        <div><strong>誓約堆疊</strong><small>純草稿・自動結算 Roguelike</small></div>
      </div>
      <div class="run-meta">
        <div class="resolve"><span>RESOLVE</span><strong>${state.resolve}<small>/20</small></strong></div>
        <div class="progress" aria-label="遭遇進度">${progress}</div>
      </div>
    </header>
    <main>
      <div class="seed-row"><span>SEED</span><code>${state.seed}</code><span>${sdk.mode === 'embedded' ? 'PLATFORM' : 'STANDALONE'}</span></div>
      ${state.phase === 'prepare' ? renderPrepare() : ''}
      ${state.phase !== 'prepare' ? renderTimeline() : state.lastResult === undefined ? '' : `<details class="previous-trace"><summary>查看上一場追溯</summary>${renderTimeline()}</details>`}
      ${state.phase === 'draft' ? renderDraft() : ''}
      ${state.phase === 'victory' || state.phase === 'defeat' ? renderEnding() : ''}
    </main>
  </div>`

  bindEvents()
}

let pendingEquip: string | null = null

function bindEvents(): void {
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
      void update(commitEncounter(state))
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

render()
