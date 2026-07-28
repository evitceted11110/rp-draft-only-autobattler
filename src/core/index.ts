import { createRng } from '@rogue-paradise/rng'

export type Trigger =
  | 'opening'
  | 'round_start'
  | 'after_hit'
  | 'self_below_half'
  | 'enemy_below_half'

export type EffectType =
  | 'damage'
  | 'heal'
  | 'guard'
  | 'amplify_base'
  | 'guard_and_damage'
  | 'damage_per_round'

export type Directive = {
  id: string
  name: string
  trigger: Trigger
  effect: EffectType
  value: number
  description: string
}

export type Objective = 'defeat' | 'endure'

export type Enemy = {
  id: string
  name: string
  tier: 'normal' | 'elite' | 'boss'
  health: number
  attacks: readonly number[]
  objective: Objective
  objectiveText: string
}

export type TimelineKind =
  | 'round'
  | 'trigger'
  | 'attack'
  | 'damage'
  | 'objective'

export type TimelineEntry = {
  kind: TimelineKind
  round: number
  message: string
  playerResolve: number
  enemyHealth: number
  guard: number
  directiveId?: string
}

export type EncounterResult = {
  won: boolean
  rounds: number
  resolve: number
  enemyHealth: number
  objective: Objective
  timeline: TimelineEntry[]
}

export type RunPhase = 'prepare' | 'draft' | 'victory' | 'defeat'

export type GameState = {
  seed: string
  phase: RunPhase
  encounterIndex: number
  resolve: number
  collection: string[]
  loadout: string[]
  draftOffer: string[]
  lastResult?: EncounterResult
}

const MAX_RESOLVE = 20
const BASE_DAMAGE = 3
const LOADOUT_SIZE = 4
const STARTING_IDS = [
  'first-word',
  'stone-protocol',
  'mercy-loop',
  'finishing-proof',
] as const

export const triggerNames: Readonly<Record<Trigger, string>> = {
  opening: '開戰',
  round_start: '回合開始',
  after_hit: '實際受傷後',
  self_below_half: '自身低於半數',
  enemy_below_half: '敵方低於半數',
}

export const directives: readonly Directive[] = [
  {
    id: 'first-word',
    name: '先聲誓詞',
    trigger: 'opening',
    effect: 'damage',
    value: 5,
    description: '開戰立即造成 5 傷害，提早打開半血窗口。',
  },
  {
    id: 'breach-mark',
    name: '破口標記',
    trigger: 'opening',
    effect: 'amplify_base',
    value: 1,
    description: '本場所有後續基礎攻擊 +1。',
  },
  {
    id: 'measured-salvo',
    name: '節制齊射',
    trigger: 'round_start',
    effect: 'damage',
    value: 4,
    description: '第一個可用的回合開始窗口造成 4 傷害。',
  },
  {
    id: 'reserve-spark',
    name: '後備火種',
    trigger: 'round_start',
    effect: 'heal',
    value: 4,
    description: '第一個可用的回合開始窗口恢復 4 resolve。',
  },
  {
    id: 'stone-protocol',
    name: '石牆協議',
    trigger: 'after_hit',
    effect: 'guard',
    value: 5,
    description: '實際受傷後獲得 5 guard，保護後續回合。',
  },
  {
    id: 'mirrored-debt',
    name: '鏡像債務',
    trigger: 'after_hit',
    effect: 'damage',
    value: 5,
    description: '實際受傷後反擊 5 傷害。',
  },
  {
    id: 'redline-clause',
    name: '紅線條款',
    trigger: 'self_below_half',
    effect: 'damage',
    value: 8,
    description: '首次低於半數 resolve 時造成 8 傷害。',
  },
  {
    id: 'mercy-loop',
    name: '慈悲迴路',
    trigger: 'self_below_half',
    effect: 'heal',
    value: 7,
    description: '首次低於半數 resolve 時恢復 7。',
  },
  {
    id: 'finishing-proof',
    name: '終局證明',
    trigger: 'enemy_below_half',
    effect: 'damage',
    value: 8,
    description: '敵人首次低於半血時追加 8 傷害。',
  },
  {
    id: 'harvest-logic',
    name: '收割邏輯',
    trigger: 'enemy_below_half',
    effect: 'heal',
    value: 5,
    description: '敵人首次低於半血時恢復 5 resolve。',
  },
  {
    id: 'sealed-answer',
    name: '封印解答',
    trigger: 'after_hit',
    effect: 'guard_and_damage',
    value: 3,
    description: '實際受傷後獲得 3 guard 並反擊 3。',
  },
  {
    id: 'delayed-fuse',
    name: '延遲引信',
    trigger: 'round_start',
    effect: 'damage_per_round',
    value: 2,
    description: '在觸發回合造成「回合數 × 2」傷害。',
  },
] as const

export const enemies: readonly Enemy[] = [
  {
    id: 'toll-keeper',
    name: '徵收者',
    tier: 'normal',
    health: 13,
    attacks: [2, 3, 3, 4, 4, 5],
    objective: 'defeat',
    objectiveText: '六回合內擊破',
  },
  {
    id: 'glass-courier',
    name: '玻璃信使',
    tier: 'normal',
    health: 22,
    attacks: [5, 2, 2, 3, 4],
    objective: 'endure',
    objectiveText: '撐過五回合公開攻勢',
  },
  {
    id: 'patient-clerk',
    name: '耐心書記',
    tier: 'normal',
    health: 18,
    attacks: [1, 1, 3, 5, 6, 7],
    objective: 'defeat',
    objectiveText: '六回合內擊破',
  },
  {
    id: 'double-entry',
    name: '複式劊子手',
    tier: 'normal',
    health: 26,
    attacks: [2, 2, 4, 4, 5, 5],
    objective: 'endure',
    objectiveText: '撐過六回合公開攻勢',
  },
  {
    id: 'red-auditor',
    name: '赤字稽核官',
    tier: 'elite',
    health: 23,
    attacks: [3, 5, 3, 6, 5, 7],
    objective: 'defeat',
    objectiveText: '六回合內擊破',
  },
  {
    id: 'compound-judge',
    name: '複利判官',
    tier: 'elite',
    health: 30,
    attacks: [2, 3, 4, 5, 6, 8],
    objective: 'endure',
    objectiveText: '撐過六回合公開攻勢',
  },
  {
    id: 'the-notary',
    name: '終局公證人',
    tier: 'boss',
    health: 26,
    attacks: [3, 4, 5, 6, 7, 9],
    objective: 'defeat',
    objectiveText: '六回合內完成最終擊破',
  },
] as const

function directiveById(id: string): Directive {
  const directive = directives.find((candidate) => candidate.id === id)
  if (directive === undefined) throw new Error(`未知指令：${id}`)
  return directive
}

function pushTimeline(
  timeline: TimelineEntry[],
  state: BattleState,
  kind: TimelineKind,
  message: string,
  directiveId?: string,
): void {
  timeline.push({
    kind,
    round: state.round,
    message,
    playerResolve: Math.max(0, state.resolve),
    enemyHealth: Math.max(0, state.enemyHealth),
    guard: state.guard,
    ...(directiveId === undefined ? {} : { directiveId }),
  })
}

type BattleState = {
  resolve: number
  enemyHealth: number
  guard: number
  baseDamage: number
  round: number
}

function applyDirective(
  directive: Directive,
  state: BattleState,
  timeline: TimelineEntry[],
): void {
  if (directive.effect === 'damage') {
    state.enemyHealth -= directive.value
  } else if (directive.effect === 'heal') {
    state.resolve = Math.min(MAX_RESOLVE, state.resolve + directive.value)
  } else if (directive.effect === 'guard') {
    state.guard += directive.value
  } else if (directive.effect === 'amplify_base') {
    state.baseDamage += directive.value
  } else if (directive.effect === 'guard_and_damage') {
    state.guard += directive.value
    state.enemyHealth -= directive.value
  } else {
    state.enemyHealth -= directive.value * state.round
  }
  pushTimeline(
    timeline,
    state,
    'trigger',
    `${directive.name}觸發：${directive.description}`,
    directive.id,
  )
}

export function resolveEncounter(
  initialResolve: number,
  enemy: Enemy,
  loadout: readonly Directive[],
): EncounterResult {
  if (loadout.length !== LOADOUT_SIZE) {
    throw new Error(`戰鬥腳本必須正好 ${LOADOUT_SIZE} 張`)
  }
  const state: BattleState = {
    resolve: initialResolve,
    enemyHealth: enemy.health,
    guard: 0,
    baseDamage: BASE_DAMAGE,
    round: 0,
  }
  const timeline: TimelineEntry[] = []
  const spent = new Set<string>()
  let selfHalfTriggered = false
  let enemyHalfTriggered = false

  const trigger = (event: Trigger): void => {
    const directive = loadout.find(
      (candidate) => candidate.trigger === event && !spent.has(candidate.id),
    )
    if (directive === undefined) return
    spent.add(directive.id)
    applyDirective(directive, state, timeline)
  }

  trigger('opening')
  if (state.resolve <= MAX_RESOLVE / 2) {
    selfHalfTriggered = true
    trigger('self_below_half')
  }

  for (const attack of enemy.attacks) {
    if (state.resolve <= 0 || state.enemyHealth <= 0) break
    state.round += 1
    pushTimeline(timeline, state, 'round', `第 ${state.round} 回合`)
    trigger('round_start')
    state.enemyHealth -= state.baseDamage
    pushTimeline(
      timeline,
      state,
      'damage',
      `基礎攻擊造成 ${state.baseDamage} 傷害`,
    )

    if (!enemyHalfTriggered && state.enemyHealth <= enemy.health / 2) {
      enemyHalfTriggered = true
      trigger('enemy_below_half')
    }
    if (state.enemyHealth <= 0) break

    const absorbed = Math.min(state.guard, attack)
    state.guard -= absorbed
    const received = attack - absorbed
    state.resolve -= received
    pushTimeline(
      timeline,
      state,
      'attack',
      `${enemy.name}攻擊 ${attack}：guard 吸收 ${absorbed}，resolve 損失 ${received}`,
    )
    if (received > 0) trigger('after_hit')
    if (!selfHalfTriggered && state.resolve <= MAX_RESOLVE / 2) {
      selfHalfTriggered = true
      trigger('self_below_half')
    }
  }

  const survived = state.resolve > 0
  const defeatedEnemy = state.enemyHealth <= 0
  const won =
    survived && (enemy.objective === 'endure' || defeatedEnemy)
  pushTimeline(
    timeline,
    state,
    'objective',
    won
      ? `契約完成：${enemy.objectiveText}`
      : `契約失敗：${enemy.objectiveText}`,
  )

  return {
    won,
    rounds: state.round,
    resolve: Math.max(0, state.resolve),
    enemyHealth: Math.max(0, state.enemyHealth),
    objective: enemy.objective,
    timeline,
  }
}

export function createInitialState(seed: string): GameState {
  if (seed.trim().length === 0) throw new Error('seed 不得為空字串')
  return {
    seed,
    phase: 'prepare',
    encounterIndex: 0,
    resolve: MAX_RESOLVE,
    collection: [...STARTING_IDS],
    loadout: [...STARTING_IDS],
    draftOffer: [],
  }
}

export function reorderLoadout(
  state: GameState,
  from: number,
  to: number,
): GameState {
  if (
    from < 0 ||
    from >= state.loadout.length ||
    to < 0 ||
    to >= state.loadout.length
  ) {
    throw new Error('腳本槽位超出範圍')
  }
  const loadout = [...state.loadout]
  const [moved] = loadout.splice(from, 1)
  loadout.splice(to, 0, moved!)
  return { ...state, loadout }
}

export function setLoadout(
  state: GameState,
  ids: readonly string[],
): GameState {
  if (ids.length !== LOADOUT_SIZE || new Set(ids).size !== LOADOUT_SIZE) {
    throw new Error(`必須選擇 ${LOADOUT_SIZE} 張不同指令`)
  }
  for (const id of ids) {
    if (!state.collection.includes(id)) {
      throw new Error(`指令不在收藏中：${id}`)
    }
    directiveById(id)
  }
  return { ...state, loadout: [...ids] }
}

function draftOfferFor(state: GameState): string[] {
  const owned = new Set(state.collection)
  const available = directives.filter(({ id }) => !owned.has(id))
  const rng = createRng(state.seed).fork(`draft-${state.encounterIndex}`)
  return rng
    .shuffle(available)
    .slice(0, Math.min(3, available.length))
    .map(({ id }) => id)
}

export function commitEncounter(state: GameState): GameState {
  if (state.phase !== 'prepare') throw new Error('目前不能提交戰鬥')
  const enemy = enemies[state.encounterIndex]
  if (enemy === undefined) throw new Error('找不到目前遭遇')
  const result = resolveEncounter(
    state.resolve,
    enemy,
    state.loadout.map(directiveById),
  )
  if (!result.won) {
    return {
      ...state,
      phase: 'defeat',
      resolve: result.resolve,
      lastResult: result,
      draftOffer: [],
    }
  }
  if (state.encounterIndex === enemies.length - 1) {
    return {
      ...state,
      phase: 'victory',
      resolve: result.resolve,
      lastResult: result,
      draftOffer: [],
    }
  }
  const draftState: GameState = {
    ...state,
    phase: 'draft',
    resolve: result.resolve,
    lastResult: result,
    draftOffer: [],
  }
  return { ...draftState, draftOffer: draftOfferFor(draftState) }
}

export function chooseDraft(state: GameState, directiveId: string): GameState {
  if (state.phase !== 'draft') throw new Error('目前不能草稿')
  if (!state.draftOffer.includes(directiveId)) {
    throw new Error('選擇不在本次草稿中')
  }
  const shouldRecover =
    state.encounterIndex === 2 || state.encounterIndex === 4
  return {
    ...state,
    phase: 'prepare',
    encounterIndex: state.encounterIndex + 1,
    resolve: shouldRecover
      ? Math.min(MAX_RESOLVE, state.resolve + 3)
      : state.resolve,
    collection: [...state.collection, directiveId],
    loadout: [...state.loadout],
    draftOffer: [],
  }
}

export function getDirective(id: string): Directive {
  return directiveById(id)
}

export function getCurrentEnemy(state: GameState): Enemy {
  const enemy = enemies[state.encounterIndex]
  if (enemy === undefined) throw new Error('找不到目前遭遇')
  return enemy
}
