import { WORDS, type Word } from './words'
export type Role = 'crew' | 'imposter'
export type Winner = 'crew' | 'imposters' | null
export interface Player { id: number; name: string; role: Role; hint?: string; out: boolean }
export interface Settings { imposters: number; categories: string[]; discussSecs: number; knowEachOther: boolean; secretVote: boolean; hideCategory: boolean; rounds: number }
export interface Game { players: Player[]; word: string; category: string; skips: number; start: number; vp: number[]; cycle: number; firstOut: number | null }
export const INDIA_SHARE = 0.6
export const SKIP_CAP = 2
export const maxImposters = (n: number) => (n >= 5 ? 2 : 1)
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
export function pickWord(cats: string[]): Word {
  const pool = WORDS.filter(w => cats.includes(w.cat)); const region = Math.random() < INDIA_SHARE ? 'in' : 'global'
  const m = pool.filter(w => w.region === region); const from = m.length ? m : pool; return from[Math.floor(Math.random() * from.length)]
}
export function newGame(names: string[], s: Settings): Game {
  const w = pickWord(s.categories); const k = Math.min(s.imposters, maxImposters(names.length))
  const imp = new Set(shuffle(names.map((_, i) => i)).slice(0, k)); const hints = shuffle(w.hints)
  let h = 0
  return { word: w.word, category: w.cat, skips: 0, start: Math.floor(Math.random() * names.length), vp: names.map(() => 0), cycle: 0, firstOut: null, players: names.map((name, id) => imp.has(id) ? { id, name, role: 'imposter', hint: hints[h++], out: false } : { id, name, role: 'crew', out: false }) }
}
/** Call only AFTER an ejection. Imposters win when 2 or fewer crew remain. */
export function checkWin(players: Player[]): Winner {
  const alive = players.filter(p => !p.out)
  if (!alive.some(p => p.role === 'imposter')) return 'crew'
  return alive.filter(p => p.role === 'crew').length <= 2 ? 'imposters' : null
}
/** votes: player id, or null for skip. Returns ejected id, or null on tie/skip. */
export function tally(votes: (number | null)[]): number | null {
  const c = new Map<number, number>(); votes.forEach(v => c.set(v ?? -1, (c.get(v ?? -1) ?? 0) + 1))
  const top = Math.max(...c.values()); const lead = [...c].filter(([, n]) => n === top)
  return lead.length === 1 && lead[0][0] !== -1 ? lead[0][0] : null
}
