import {
  frequency,
  numericStats,
  rate,
  simulate,
  type NumericStats,
} from '@rogue-paradise/sim'
import type { Rng } from '@rogue-paradise/rng'

export type Trigger =
  | 'opening'
  | 'round_start'
  | 'after_hit'
  | 'self_below_half'
  | 'enemy_below_half'

type Effect =
  | 'damage'
  | 'heal'
  | 'guard'
  | 'amplify_base'
  | 'guard_and_damage'
  | 'damage_per_round'

export type Directive = {
  id: string
  trigger: Trigger
  effect: Effect
  value: number
  tags: readonly Strategy[]
}

export type Enemy = {
  id: string
  health: number
  attacks: readonly number[]
}

export type Strategy = 'assault' | 'fortress' | 'reactive' | 'threshold'

export type PrototypeResult = {
  won: boolean
  strategy: Strategy
  encountersCleared: number
  finalResolve: number
  selected: string[]
  buildSignature: string
}

export type PrototypeSummary = {
  seed: string
  runs: number
  winRate: number
  clearStats: NumericStats
  finalResolveStats: NumericStats
  strategyFrequency: Record<string, number>
  strategyWinRate: Record<Strategy, number>
  strategyMeanClear: Record<Strategy, number>
  finalBuildFrequencyByStrategy: Record<
    Strategy,
    Record<string, number>
  >
  winningBuildFrequency: Record<string, number>
  winningDirectiveFrequency: Record<string, number>
  winningDirectiveInclusionRate: Record<string, number>
  topFiveBuildShare: number
}

const MAX_RESOLVE = 20
const LOADOUT_SIZE = 4
const BASE_DAMAGE = 3
const STARTING_IDS = [
  'first-word',
  'stone-protocol',
  'mercy-loop',
  'finishing-proof',
] as const

export const directives: readonly Directive[] = [
  {
    id: 'first-word',
    trigger: 'opening',
    effect: 'damage',
    value: 5,
    tags: ['assault'],
  },
  {
    id: 'breach-mark',
    trigger: 'opening',
    effect: 'amplify_base',
    value: 1,
    tags: ['assault', 'threshold'],
  },
  {
    id: 'measured-salvo',
    trigger: 'round_start',
    effect: 'damage',
    value: 4,
    tags: ['assault', 'reactive'],
  },
  {
    id: 'reserve-spark',
    trigger: 'round_start',
    effect: 'heal',
    value: 4,
    tags: ['fortress'],
  },
  {
    id: 'stone-protocol',
    trigger: 'after_hit',
    effect: 'guard',
    value: 5,
    tags: ['fortress', 'reactive'],
  },
  {
    id: 'mirrored-debt',
    trigger: 'after_hit',
    effect: 'damage',
    value: 5,
    tags: ['reactive'],
  },
  {
    id: 'redline-clause',
    trigger: 'self_below_half',
    effect: 'damage',
    value: 8,
    tags: ['threshold', 'assault'],
  },
  {
    id: 'mercy-loop',
    trigger: 'self_below_half',
    effect: 'heal',
    value: 7,
    tags: ['fortress', 'threshold'],
  },
  {
    id: 'finishing-proof',
    trigger: 'enemy_below_half',
    effect: 'damage',
    value: 8,
    tags: ['threshold', 'assault'],
  },
  {
    id: 'harvest-logic',
    trigger: 'enemy_below_half',
    effect: 'heal',
    value: 5,
    tags: ['threshold', 'fortress'],
  },
  {
    id: 'sealed-answer',
    trigger: 'after_hit',
    effect: 'guard_and_damage',
    value: 3,
    tags: ['reactive', 'fortress'],
  },
  {
    id: 'delayed-fuse',
    trigger: 'round_start',
    effect: 'damage_per_round',
    value: 2,
    tags: ['reactive', 'assault'],
  },
] as const

export const enemies: readonly Enemy[] = [
  { id: 'toll-keeper', health: 13, attacks: [2, 3, 3, 4, 4, 5] },
  { id: 'glass-courier', health: 15, attacks: [5, 2, 2, 3, 4, 5] },
  { id: 'patient-clerk', health: 17, attacks: [1, 1, 3, 5, 6, 7] },
  { id: 'double-entry', health: 18, attacks: [2, 2, 4, 4, 5, 5] },
  { id: 'red-auditor', health: 23, attacks: [3, 5, 3, 6, 5, 7] },
  { id: 'compound-judge', health: 26, attacks: [2, 3, 4, 5, 6, 8] },
  { id: 'the-notary', health: 32, attacks: [3, 4, 5, 6, 7, 9] },
] as const

function applyDirective(
  directive: Directive,
  state: {
    resolve: number
    enemyHealth: number
    guard: number
    baseDamage: number
    round: number
  },
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
}

export function resolveEncounter(
  initialResolve: number,
  enemy: Enemy,
  loadout: readonly Directive[],
): { won: boolean; resolve: number } {
  const state = {
    resolve: initialResolve,
    enemyHealth: enemy.health,
    guard: 0,
    baseDamage: BASE_DAMAGE,
    round: 0,
  }
  const spent = new Set<string>()
  let selfHalfTriggered = false
  let enemyHalfTriggered = false

  const trigger = (event: Trigger): void => {
    const directive = loadout.find(
      (candidate) => candidate.trigger === event && !spent.has(candidate.id),
    )
    if (directive === undefined) return
    spent.add(directive.id)
    applyDirective(directive, state)
  }

  trigger('opening')
  if (state.resolve <= MAX_RESOLVE / 2) {
    selfHalfTriggered = true
    trigger('self_below_half')
  }
  for (const attack of enemy.attacks) {
    if (state.enemyHealth <= 0 || state.resolve <= 0) break
    state.round += 1
    trigger('round_start')
    state.enemyHealth -= state.baseDamage

    if (!enemyHalfTriggered && state.enemyHealth <= enemy.health / 2) {
      enemyHalfTriggered = true
      trigger('enemy_below_half')
    }
    if (state.enemyHealth <= 0) break

    const absorbed = Math.min(state.guard, attack)
    state.guard -= absorbed
    const received = attack - absorbed
    state.resolve -= received
    if (received > 0) trigger('after_hit')

    if (!selfHalfTriggered && state.resolve <= MAX_RESOLVE / 2) {
      selfHalfTriggered = true
      trigger('self_below_half')
    }
  }

  return {
    won: state.enemyHealth <= 0 && state.resolve > 0,
    resolve: Math.max(0, state.resolve),
  }
}

type Affinities = Readonly<Record<string, number>>

function scoreDirective(
  directive: Directive,
  strategy: Strategy,
  affinities: Affinities,
): number {
  const tagScore = directive.tags.includes(strategy) ? 10 : 0
  const survivalBias =
    strategy === 'fortress' &&
    (directive.effect === 'heal' ||
      directive.effect === 'guard' ||
      directive.effect === 'guard_and_damage')
      ? 3
      : 0
  const damageBias =
    strategy === 'assault' && isOffensive(directive) ? 3 : 0
  return (
    tagScore +
    survivalBias +
    damageBias +
    directive.value / 10 +
    (affinities[directive.id] ?? 0)
  )
}

function isOffensive(directive: Directive): boolean {
  return (
    directive.effect === 'damage' ||
    directive.effect === 'amplify_base' ||
    directive.effect === 'guard_and_damage' ||
    directive.effect === 'damage_per_round'
  )
}

function chooseBest(
  candidates: readonly Directive[],
  strategy: Strategy,
  affinities: Affinities,
): Directive {
  return [...candidates].sort(
    (left, right) =>
      scoreDirective(right, strategy, affinities) -
        scoreDirective(left, strategy, affinities) ||
      left.id.localeCompare(right.id),
  )[0]!
}

function chooseLoadout(
  collection: readonly Directive[],
  strategy: Strategy,
  affinities: Affinities,
): Directive[] {
  const ranked = [...collection].sort(
    (left, right) =>
      scoreDirective(right, strategy, affinities) -
        scoreDirective(left, strategy, affinities) ||
      left.id.localeCompare(right.id),
  )
  const requiredDamage = ranked
    .filter(isOffensive)
    .slice(0, 3)
  const requiredIds = new Set(requiredDamage.map(({ id }) => id))
  const selected = [
    ...requiredDamage,
    ...ranked.filter(({ id }) => !requiredIds.has(id)),
  ]
    .slice(0, LOADOUT_SIZE)
    .sort((left, right) => {
      const eventOrder: Trigger[] = [
        'opening',
        'round_start',
        'after_hit',
        'enemy_below_half',
        'self_below_half',
      ]
      return eventOrder.indexOf(left.trigger) - eventOrder.indexOf(right.trigger)
    })
  return selected
}

function draft(
  collection: readonly Directive[],
  strategy: Strategy,
  rng: Rng,
  affinities: Affinities,
): Directive[] {
  const owned = new Set(collection.map(({ id }) => id))
  const available = directives.filter(({ id }) => !owned.has(id))
  if (available.length === 0) return [...collection]
  const offer = rng.shuffle(available).slice(0, Math.min(3, available.length))
  return [...collection, chooseBest(offer, strategy, affinities)]
}

function playRun(rng: Rng): PrototypeResult {
  const strategies: readonly Strategy[] = [
    'assault',
    'fortress',
    'reactive',
    'threshold',
  ]
  const strategy = rng.pick(strategies)
  const affinities = Object.fromEntries(
    directives.map(({ id }) => [
      id,
      rng.fork(`affinity-${id}`).next() * 4,
    ]),
  )
  let resolve = MAX_RESOLVE
  let collection = STARTING_IDS.map(
    (id) => directives.find((directive) => directive.id === id)!,
  )
  let encountersCleared = 0
  let finalLoadout = chooseLoadout(collection, strategy, affinities)

  for (const [index, enemy] of enemies.entries()) {
    finalLoadout = chooseLoadout(collection, strategy, affinities)
    const result = resolveEncounter(resolve, enemy, finalLoadout)
    resolve = result.resolve
    if (!result.won) break

    encountersCleared += 1
    if (index === 2 || index === 4) {
      resolve = Math.min(MAX_RESOLVE, resolve + 3)
    }
    collection = draft(
      collection,
      strategy,
      rng.fork(`draft-${index}`),
      affinities,
    )
  }

  const selected = finalLoadout.map(({ id }) => id)
  return {
    won: encountersCleared === enemies.length,
    strategy,
    encountersCleared,
    finalResolve: resolve,
    selected,
    buildSignature: selected.slice().sort().join('+'),
  }
}

export function runPrototype(
  runs: number,
  seed = 'draft-only-autobattler-prototype-v1',
) {
  return simulate(playRun, { seed, runs })
}

export function summarizePrototype(
  runs: number,
  seed = 'draft-only-autobattler-prototype-v1',
): PrototypeSummary {
  const report = runPrototype(runs, seed)
  const winners = report.results.filter(({ won }) => won)
  const strategies: readonly Strategy[] = [
    'assault',
    'fortress',
    'reactive',
    'threshold',
  ]
  const winningBuildFrequency = frequency(
    winners.map(({ buildSignature }) => buildSignature),
  )
  const topFiveBuildShare = Object.values(winningBuildFrequency)
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, share) => sum + share, 0)

  return {
    seed: report.seed,
    runs: report.runs,
    winRate: rate(report.results.map(({ won }) => won)),
    clearStats: numericStats(
      report.results.map(({ encountersCleared }) => encountersCleared),
    ),
    finalResolveStats: numericStats(
      report.results.map(({ finalResolve }) => finalResolve),
    ),
    strategyFrequency: frequency(
      report.results.map(({ strategy }) => strategy),
    ),
    strategyWinRate: Object.fromEntries(
      strategies.map((strategy) => [
        strategy,
        rate(
          report.results
            .filter((result) => result.strategy === strategy)
            .map(({ won }) => won),
        ),
      ]),
    ) as Record<Strategy, number>,
    strategyMeanClear: Object.fromEntries(
      strategies.map((strategy) => {
        const results = report.results.filter(
          (result) => result.strategy === strategy,
        )
        return [
          strategy,
          results.reduce(
            (sum, { encountersCleared }) => sum + encountersCleared,
            0,
          ) / results.length,
        ]
      }),
    ) as Record<Strategy, number>,
    finalBuildFrequencyByStrategy: Object.fromEntries(
      strategies.map((strategy) => [
        strategy,
        frequency(
          report.results
            .filter((result) => result.strategy === strategy)
            .map(({ buildSignature }) => buildSignature),
        ),
      ]),
    ) as Record<Strategy, Record<string, number>>,
    winningBuildFrequency,
    winningDirectiveFrequency: frequency(
      winners.flatMap(({ selected }) => selected),
    ),
    winningDirectiveInclusionRate: Object.fromEntries(
      directives.map(({ id }) => [
        id,
        winners.length === 0
          ? 0
          : winners.filter(({ selected }) => selected.includes(id)).length /
            winners.length,
      ]),
    ),
    topFiveBuildShare,
  }
}
