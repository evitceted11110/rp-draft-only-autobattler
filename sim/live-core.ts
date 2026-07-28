import type { Rng } from '@rogue-paradise/rng'
import {
  frequency,
  numericStats,
  rate,
  simulate,
  type NumericStats,
} from '@rogue-paradise/sim'
import {
  chooseDraft,
  commitEncounter,
  createInitialState,
  directives,
  enemies,
  getCurrentEnemy,
  getDirective,
  setLoadout,
  type Directive,
  type GameState,
  type Objective,
} from '../src/core/index.js'

export type LiveStrategy =
  | 'assault'
  | 'fortress'
  | 'adaptive'
  | 'threshold'

export type LiveRunResult = {
  won: boolean
  strategy: LiveStrategy
  encountersCleared: number
  finalResolve: number
  finalBuild: string
  usedDirectives: string[]
  usedBuilds: string[]
}

export type LiveSummary = {
  seed: string
  runs: number
  winRate: number
  clearStats: NumericStats
  strategyWinRate: Record<LiveStrategy, number>
  strategyMeanClear: Record<LiveStrategy, number>
  finalBuildFrequency: Record<string, number>
  winningBuildFrequency: Record<string, number>
  winningDirectiveInclusionRate: Record<string, number>
  topFiveWinningBuildShare: number
}

const strategies: readonly LiveStrategy[] = [
  'assault',
  'fortress',
  'adaptive',
  'threshold',
]

function isDamage(directive: Directive): boolean {
  return (
    directive.effect === 'damage' ||
    directive.effect === 'amplify_base' ||
    directive.effect === 'guard_and_damage' ||
    directive.effect === 'damage_per_round'
  )
}

function isSurvival(directive: Directive): boolean {
  return (
    directive.effect === 'heal' ||
    directive.effect === 'guard' ||
    directive.effect === 'guard_and_damage'
  )
}

function score(
  directive: Directive,
  strategy: LiveStrategy,
  objective: Objective,
  affinity: number,
): number {
  const damage = isDamage(directive) ? 8 : 0
  const survival = isSurvival(directive) ? 8 : 0
  const objectiveScore =
    objective === 'defeat'
      ? damage * 2.5 + survival * 0.5
      : survival * 2.5 + damage * 0.5
  const strategyScore =
    strategy === 'assault'
      ? damage * 0.6
      : strategy === 'fortress'
        ? survival * 0.6
        : strategy === 'threshold'
          ? directive.trigger.includes('below_half')
            ? 0.5
            : 0
          : objectiveScore
  return objectiveScore + strategyScore + directive.value / 10 + affinity
}

function loadoutFor(
  state: GameState,
  strategy: LiveStrategy,
  affinities: Readonly<Record<string, number>>,
): string[] {
  const enemy = getCurrentEnemy(state)
  const eventOrder = [
    'opening',
    'round_start',
    'after_hit',
    'enemy_below_half',
    'self_below_half',
  ]
  return state.collection
    .map(getDirective)
    .sort(
      (left, right) =>
        score(
          right,
          strategy,
          enemy.objective,
          affinities[right.id] ?? 0,
        ) -
          score(
            left,
            strategy,
            enemy.objective,
            affinities[left.id] ?? 0,
          ) ||
        eventOrder.indexOf(left.trigger) -
          eventOrder.indexOf(right.trigger) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 4)
    .sort(
      (left, right) =>
        eventOrder.indexOf(left.trigger) -
        eventOrder.indexOf(right.trigger),
    )
    .map(({ id }) => id)
}

function chooseOffer(
  state: GameState,
  strategy: LiveStrategy,
  affinities: Readonly<Record<string, number>>,
): string {
  const nextEnemy = enemies[state.encounterIndex + 1]
  const nextObjective = nextEnemy?.objective ?? 'defeat'
  return [...state.draftOffer]
    .map(getDirective)
    .sort(
      (left, right) =>
        score(
          right,
          strategy,
          nextObjective,
          affinities[right.id] ?? 0,
        ) -
          score(
            left,
            strategy,
            nextObjective,
            affinities[left.id] ?? 0,
          ) ||
        left.id.localeCompare(right.id),
    )[0]!.id
}

function playLiveRun(rng: Rng): LiveRunResult {
  const strategy = rng.pick(strategies)
  const affinities = Object.fromEntries(
    directives.map(({ id }) => [
      id,
      rng.fork(`affinity-${id}`).next() * 4,
    ]),
  )
  let state = createInitialState(rng.seed)
  const usedDirectives = new Set<string>()
  const usedBuilds: string[] = []

  while (state.phase === 'prepare' || state.phase === 'draft') {
    if (state.phase === 'prepare') {
      const loadout = loadoutFor(state, strategy, affinities)
      loadout.forEach((id) => usedDirectives.add(id))
      if (state.encounterIndex > 0) {
        usedBuilds.push([...loadout].sort().join('+'))
      }
      state = setLoadout(state, loadout)
      state = commitEncounter(state)
    } else {
      state = chooseDraft(
        state,
        chooseOffer(state, strategy, affinities),
      )
    }
  }

  return {
    won: state.phase === 'victory',
    strategy,
    encountersCleared:
      state.phase === 'victory'
        ? enemies.length
        : state.encounterIndex,
    finalResolve: state.resolve,
    finalBuild: [...state.loadout].sort().join('+'),
    usedDirectives: [...usedDirectives].sort(),
    usedBuilds,
  }
}

export function runLiveCore(
  runs: number,
  seed = 'draft-only-autobattler-live-core-v1',
) {
  return simulate(playLiveRun, { runs, seed })
}

export function summarizeLiveCore(
  runs: number,
  seed = 'draft-only-autobattler-live-core-v1',
): LiveSummary {
  const report = runLiveCore(runs, seed)
  const winners = report.results.filter(({ won }) => won)
  const winningBuildFrequency = frequency(
    winners.flatMap(({ usedBuilds }) => usedBuilds),
  )
  return {
    seed,
    runs,
    winRate: rate(report.results.map(({ won }) => won)),
    clearStats: numericStats(
      report.results.map(({ encountersCleared }) => encountersCleared),
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
    ) as Record<LiveStrategy, number>,
    strategyMeanClear: Object.fromEntries(
      strategies.map((strategy) => {
        const results = report.results.filter(
          (result) => result.strategy === strategy,
        )
        return [
          strategy,
          results.reduce(
            (sum, { encountersCleared }) =>
              sum + encountersCleared,
            0,
          ) / results.length,
        ]
      }),
    ) as Record<LiveStrategy, number>,
    finalBuildFrequency: frequency(
      report.results.map(({ finalBuild }) => finalBuild),
    ),
    winningBuildFrequency,
    winningDirectiveInclusionRate: Object.fromEntries(
      directives.map(({ id }) => [
        id,
        winners.length === 0
          ? 0
          : winners.filter(({ usedDirectives }) =>
              usedDirectives.includes(id),
            ).length / winners.length,
      ]),
    ),
    topFiveWinningBuildShare: Object.values(winningBuildFrequency)
      .sort((left, right) => right - left)
      .slice(0, 5)
      .reduce((sum, share) => sum + share, 0),
  }
}
