import { summarizePrototype } from './prototype.js'

const runs = Number(process.argv[2] ?? '20000')
if (!Number.isInteger(runs) || runs < 10_000) {
  throw new Error(`報告局數必須是至少 10000 的整數，收到 ${runs}`)
}

const summary = summarizePrototype(
  runs,
  'draft-only-autobattler-gate-2-baseline',
)
console.log(JSON.stringify(summary, null, 2))
