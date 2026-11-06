import type { Game, Winner } from './engine'
export const POINTS = { crewWin: 2, imposterWin: 3, correctVote: 1, surviveFirst: 1 }
export const MATCH_ROUNDS = [1, 3, 5, 10]
/** Points per player id for one finished round. g.vp counts correct crew votes (secret vote only). */
export const roundPoints = (g: Game, w: Exclude<Winner, null>): number[] =>
  g.players.map(p => (p.role === 'crew' ? (w === 'crew' ? POINTS.crewWin : 0) : w === 'imposters' ? POINTS.imposterWin : 0) + g.vp[p.id] * POINTS.correctVote + (p.role === 'imposter' && g.firstOut !== p.id ? POINTS.surviveFirst : 0))
export const matchWinners = (names: string[], totals: number[]) => { const top = Math.max(...totals); return names.filter((_, i) => totals[i] === top) }
