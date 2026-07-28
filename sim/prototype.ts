import { simulate } from '@rogue-paradise/sim'

export function runPrototype(runs: number) {
  return simulate((rng) => ({ roll: rng.int(1, 6) }), {
    seed: 'draft-only-autobattler-prototype',
    runs,
  })
}
