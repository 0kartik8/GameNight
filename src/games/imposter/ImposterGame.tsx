import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, Plus, Trash2 } from 'lucide-react'
import { Button, Chip, Shell } from '../../components/ui'
import { useCountdown } from '../../hooks/useCountdown'
import { CATEGORIES } from './words'
import { checkWin, maxImposters, newGame, SKIP_CAP, tally, type Game, type Settings, type Winner } from './engine'
import { MATCH_ROUNDS, matchWinners, roundPoints } from './scoring'

type Phase = { t: 'setup' } | { t: 'pass' | 'reveal' | 'turns' | 'vote'; i: number } | { t: 'discuss' } | { t: 'eject'; id: number | null } | { t: 'end'; w: Exclude<Winner, null>; why: string }
const Title = ({ children }: { children: string }) => <h1 className="pop mb-4 font-display text-3xl font-extrabold">{children}</h1>
const Pass = ({ name, label, onGo }: { name: string; label: string; onGo: () => void }) => (
  <div className="pop py-16 text-center"><p className="text-white/60">{label}</p><div className="my-6 font-display text-6xl font-extrabold text-amber">{name}</div><Button onClick={onGo}>I am {name}</Button></div>)

function Reveal({ g, i, k, h, onDone }: { g: Game; i: number; k: boolean; h: boolean; onDone: () => void }) {
  const [show, setShow] = useState(false); const p = g.players[i]
  const mates = g.players.filter(x => x.role === 'imposter' && x.id !== p.id).map(x => x.name).join(', ')
  return (<div className="pop text-center">{!h && <p className="mb-3 text-white/60">Category: <b className="text-lime">{g.category}</b></p>}
    <div className="select-none rounded-3xl bg-panel p-8" onPointerDown={() => setShow(true)} onPointerUp={() => setShow(false)} onPointerLeave={() => setShow(false)} style={{ touchAction: 'none' }}>
      {show ? (p.role === 'crew' ? <><p className="text-white/60">The word is</p><div className="font-display text-5xl font-extrabold text-lime">{g.word}</div></>
        : <><div className="font-display text-4xl font-extrabold text-pink">YOU ARE THE IMPOSTER</div><p className="mt-3">Hint: <b>{p.hint}</b></p>{k && mates && <p className="mt-2 text-white/70">Partner: {mates}</p>}</>)
        : <div className="flex flex-col items-center gap-3 py-6 text-white/60"><Eye className="size-10"/>Hold to reveal. Release to hide.</div>}</div>
    <Button className="mt-6 w-full" onClick={onDone}>Hide & pass on</Button></div>)
}
function Vote({ name, targets, label, onPick }: { name: string; targets: { id: number; name: string }[]; label: string; onPick: (id: number | null) => void }) {
  const [ready, setReady] = useState(label === 'open')
  if (!ready) return <Pass name={name} label="Pass the device to" onGo={() => setReady(true)}/>
  return (<div className="pop"><Title>{label === 'open' ? 'Group vote: who got the most votes?' : `${name}, who is the imposter?`}</Title>
    <div className="grid grid-cols-2 gap-3">{targets.filter(t => t.name !== name || label === 'open').map(t => <Button key={t.id} variant="ghost" onClick={() => onPick(t.id)}>{t.name}</Button>)}</div>
    <Button className="mt-4 w-full" variant="ghost" onClick={() => onPick(null)}>Skip</Button></div>)
}
function Discuss({ secs, onDone }: { secs: number; onDone: () => void }) {
  const left = useCountdown(secs, onDone)
  return (<div className="pop py-12 text-center"><Title>Discuss!</Title><div className="font-display text-9xl font-extrabold tabular-nums text-amber">{left}</div>
    <div className="mx-auto my-6 h-2 w-64 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-pink transition-all duration-1000" style={{ width: `${(left / secs) * 100}%` }}/></div>
    <Button variant="ghost" onClick={onDone}>Skip to voting</Button></div>)
}

const Board = ({ names, totals, pts }: { names: string[]; totals: number[]; pts: number[] | null }) => (
  <div className="rounded-3xl bg-panel p-5">{names.map((n, i) => ({ n, t: totals[i], p: pts ? pts[i] : 0 })).sort((a, b) => b.t - a.t).map(r => <div key={r.n} className="flex items-center justify-between py-1"><span>{r.n}</span><span><b className="font-display text-xl text-amber">{r.t}</b>{r.p > 0 && <span className="ml-2 text-lime">+{r.p}</span>}</span></div>)}</div>)

export default function ImposterGame() {
  const [names, setNames] = useState(['', '', ''])
  const [s, setS] = useState<Settings>({ imposters: 1, categories: CATEGORIES, discussSecs: 60, knowEachOther: false, secretVote: true, hideCategory: false, rounds: 1 })
  const [g, setG] = useState<Game | null>(null); const [phase, setPhase] = useState<Phase>({ t: 'setup' }); const [err, setErr] = useState('')
  const votes = useRef<(number | null)[]>([])
  const [totals, setTotals] = useState<number[]>([]); const [pts, setPts] = useState<number[] | null>(null); const [round, setRound] = useState(1); const [early, setEarly] = useState(false)
  const alive = g ? g.players.filter(p => !p.out) : []
  const clean = names.map(n => n.trim()); const over = early || round >= s.rounds
  const begin = () => {
    if (clean.some(n => !n)) return setErr('Fill every name.')
    if (new Set(clean.map(n => n.toLowerCase())).size !== clean.length) return setErr('Names must be unique.')
    if (!s.categories.length) return setErr('Pick at least one category.')
    setErr(''); setTotals(clean.map(() => 0)); setPts(null); setRound(1); setEarly(false); setG(newGame(clean, { ...s, imposters: Math.min(s.imposters, maxImposters(clean.length)) })); setPhase({ t: 'pass', i: 0 })
  }
  const pick = (id: number | null) => {
    votes.current.push(id); const last = !s.secretVote || (phase.t === 'vote' && phase.i + 1 >= alive.length)
    if (!last && phase.t === 'vote') return setPhase({ t: 'vote', i: phase.i + 1 })
    const vs = votes.current; const out = tally(vs); votes.current = []
    if (g && s.secretVote) { const vp = [...g.vp]; vs.forEach((v, n) => { const voter = alive[n]; if (v !== null && voter?.role === 'crew' && g.players[v].role === 'imposter') vp[voter.id]++ }); setG({ ...g, vp }) }
    setPhase({ t: 'eject', id: out })
  }
  const afterEject = (id: number | null) => {
    if (!g) return
    const players = g.players.map(p => p.id === id ? { ...p, out: true } : p); const skips = id === null ? g.skips + 1 : 0
   const ng: Game = { ...g, players, skips, cycle: g.cycle + 1, firstOut: g.cycle === 0 ? id : g.firstOut, start: Math.floor(Math.random() * players.filter(p => !p.out).length) }; setG(ng)
    const w = id !== null ? checkWin(players) : skips >= SKIP_CAP ? 'imposters' : null
    if (w) { const p = roundPoints(ng, w); setPts(p); setTotals(totals.map((t, i) => t + p[i])); return setPhase({ t: 'end', w, why: id === null ? `${SKIP_CAP} votes in a row ejected nobody.` : w === 'crew' ? 'All imposters ejected.' : 'Two or fewer crew left.' }) }
    setPhase({ t: 'turns', i: 0 })
  }
  const toggleCat = (c: string) => setS({ ...s, categories: s.categories.includes(c) ? s.categories.filter(x => x !== c) : [...s.categories, c] })
  const Row = ({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) => <button onClick={() => set(!on)} className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3"><span>{label}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-lime text-ink' : 'bg-white/10'}`}>{on ? 'ON' : 'OFF'}</span></button>

  return (<Shell><Link to="/" className="mb-4 inline-flex items-center gap-1 text-white/60 hover:text-white"><ArrowLeft className="size-4"/>Home</Link>
    {phase.t === 'setup' && <div className="pop space-y-5"><Title>Imposter setup</Title>
      <div className="space-y-2">{names.map((n, i) => <div key={i} className="flex gap-2"><input value={n} maxLength={14} placeholder={`Player ${i + 1}`} onChange={e => setNames(names.map((x, j) => j === i ? e.target.value : x))} className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-pink"/>
        {names.length > 3 && <button aria-label="Remove" onClick={() => setNames(names.filter((_, j) => j !== i))} className="rounded-2xl bg-white/10 px-3"><Trash2 className="size-4"/></button>}</div>)}
        {names.length < 10 && <Button variant="ghost" onClick={() => setNames([...names, ''])}><Plus className="mr-1 inline size-4"/>Add player</Button>}</div>
      <div><p className="mb-2 text-white/60">Imposters</p><div className="flex gap-2">{[1, 2].map(n => <Chip key={n} on={Math.min(s.imposters, maxImposters(names.length)) === n} onClick={() => n <= maxImposters(names.length) && setS({ ...s, imposters: n })}>{n}{n > maxImposters(names.length) ? ' (needs 5+ players)' : ''}</Chip>)}</div></div>
      <div><p className="mb-2 text-white/60">Categories</p><div className="flex flex-wrap gap-2">{CATEGORIES.map(c => <Chip key={c} on={s.categories.includes(c)} onClick={() => toggleCat(c)}>{c}</Chip>)}</div></div>
      <div><p className="mb-2 text-white/60">Discussion time</p><div className="flex gap-2">{[30, 60, 120, 180].map(n => <Chip key={n} on={s.discussSecs === n} onClick={() => setS({ ...s, discussSecs: n })}>{n}s</Chip>)}</div></div>
      <div><p className="mb-2 text-white/60">Rounds</p><div className="flex gap-2">{MATCH_ROUNDS.map(n => <Chip key={n} on={s.rounds === n} onClick={() => setS({ ...s, rounds: n })}>{n}</Chip>)}</div></div><Row label="Imposters know each other" on={s.knowEachOther} set={v => setS({ ...s, knowEachOther: v })}/><Row label="Secret voting (pass device)" on={s.secretVote} set={v => setS({ ...s, secretVote: v })}/><Row label="Hide category from players" on={s.hideCategory} set={v => setS({ ...s, hideCategory: v })}/>
      {err && <p role="alert" className="rounded-2xl bg-pink/20 px-4 py-3 text-pink">{err}</p>}<Button className="w-full" onClick={begin}>Start game</Button></div>}
    {g && phase.t === 'pass' && <Pass name={g.players[phase.i].name} label="Pass the device to" onGo={() => setPhase({ t: 'reveal', i: phase.i })}/>}
    {g && phase.t === 'reveal' && <Reveal key={phase.i} g={g} i={phase.i} k={s.knowEachOther} h={s.hideCategory} onDone={() => setPhase(phase.i + 1 < g.players.length ? { t: 'pass', i: phase.i + 1 } : { t: 'turns', i: 0 })}/>}
    {g && phase.t === 'turns' && <div className="pop py-12 text-center"><p className="text-white/60">Say one clue aloud{!s.hideCategory && <> · Category: {g.category}</>}</p><div className="my-6 font-display text-6xl font-extrabold text-amber">{alive[(g.start + phase.i) % alive.length].name}</div>{phase.i === 0 && <p className="-mt-3 mb-5 font-bold text-lime">Starts this round</p>}
      <Button onClick={() => setPhase(phase.i + 1 < alive.length ? { t: 'turns', i: phase.i + 1 } : { t: 'discuss' })}>{phase.i + 1 < alive.length ? 'Next speaker' : 'Start discussion'}</Button></div>}
    {phase.t === 'discuss' && <Discuss secs={s.discussSecs} onDone={() => { votes.current = []; setPhase({ t: 'vote', i: 0 }) }}/>}
    {g && phase.t === 'vote' && <Vote key={phase.i} name={s.secretVote ? alive[phase.i].name : 'Group'} label={s.secretVote ? 'secret' : 'open'} targets={alive} onPick={pick}/>}
    {g && phase.t === 'eject' && (() => { const p = g.players.find(x => x.id === phase.id); return <div className="pop py-16 text-center">
      {p ? <><div className="font-display text-5xl font-extrabold">{p.name}</div><p className={`mt-3 text-2xl font-bold ${p.role === 'imposter' ? 'text-lime' : 'text-pink'}`}>{p.role === 'imposter' ? 'was an Imposter' : 'was not an Imposter'}</p></> : <div className="font-display text-4xl font-extrabold">Nobody ejected</div>}
      <Button className="mt-8" onClick={() => afterEject(phase.id)}>Continue</Button></div> })()}
    {g && phase.t === 'end' && <div className="pop space-y-4"><Title>{phase.w === 'crew' ? 'Crew wins!' : 'Imposters win!'}</Title><p className="text-white/70">{phase.why} Category: {g.category}.</p>
      <div className="rounded-3xl bg-panel p-5"><p className="text-white/60">The word was</p><div className="font-display text-4xl font-extrabold text-lime">{g.word}</div>
        {g.players.filter(p => p.role === 'imposter').map(p => <p key={p.id} className="mt-2"><b className="text-pink">{p.name}</b> · hint: {p.hint}</p>)}</div>
      <p className="text-white/60">Round {round} of {s.rounds}</p><Board names={clean} totals={totals} pts={pts}/>
      {over ? <><p className="text-center font-display text-2xl font-extrabold text-amber">{matchWinners(clean, totals).join(' & ')} {matchWinners(clean, totals).length > 1 ? 'win' : 'wins'} the match!</p><Button className="w-full" onClick={begin}>New match</Button></>
        : <><Button className="w-full" onClick={() => { setG(newGame(clean, { ...s, imposters: Math.min(s.imposters, maxImposters(clean.length)) })); setRound(round + 1); setPts(null); setPhase({ t: 'pass', i: 0 }) }}>Next round</Button><Button className="w-full" variant="ghost" onClick={() => setEarly(true)}>End match early</Button></>}
      <Button className="w-full" variant="ghost" onClick={() => setPhase({ t: 'setup' })}>Back to setup</Button></div>}
  </Shell>)
}
