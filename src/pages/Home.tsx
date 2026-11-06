import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Landmark, Pencil, VenetianMask, Zap, type LucideIcon } from 'lucide-react'
import { Button, Dialog, Shell } from '../components/ui'
const games: { name: string; blurb: string; icon: LucideIcon; live: boolean; tone: string; path?: string}[] = [
  { name: 'Imposter', blurb: 'Find who is bluffing. Pass one phone around.', icon: VenetianMask, live: true, tone: 'from-pink to-violet', path: '/imposter' },
  { name: 'Business', blurb: 'Buy Indian cities. Build. Trade. Bankrupt your friends.', icon: Landmark, live: true, tone: 'from-pink to-amber', path: '/business' },
  { name: 'Trivia Clash', blurb: 'Fast quiz battles.', icon: Brain, live: false, tone: 'from-amber to-pink' },
  { name: 'Draw & Guess', blurb: 'Sketch it. Guess it.', icon: Pencil, live: false, tone: 'from-lime to-violet' },
  { name: 'Reflex Rush', blurb: 'Tap faster than friends.', icon: Zap, live: false, tone: 'from-violet to-amber' }]
export default function Home() {
  const nav = useNavigate(); const [dlg, setDlg] = useState(false); const [code, setCode] = useState('')
  return (<Shell>
    <section className="pop pb-10 pt-12"><p className="font-bold uppercase tracking-widest text-lime">Party games for your crew</p>
      <h1 className="font-display text-6xl font-extrabold leading-none sm:text-8xl">Game<span className="bg-gradient-to-r from-pink to-amber bg-clip-text text-transparent">Night</span></h1>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button onClick={() => setDlg(true)}>Create Room</Button>
        <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="ROOM CODE" className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 font-display font-bold tracking-widest outline-none focus:ring-2 focus:ring-pink"/>
          <Button variant="ghost" onClick={() => setDlg(true)}>Join</Button></div></div></section>
    <h2 className="mb-4 font-display text-2xl font-extrabold">Pick a game</h2>
    <div className="grid gap-4 sm:grid-cols-2">{games.map((g, i) => (
      <button key={g.name} disabled={!g.live} onClick={() => g.path && nav(g.path)} style={{ rotate: `${i % 2 ? 1 : -1}deg` }}
        className={`pop rounded-3xl bg-gradient-to-br ${g.tone} p-5 text-left transition hover:rotate-0 hover:scale-[1.02] active:scale-95 ${g.live ? '' : 'opacity-60'}`}>
        <g.icon className="mb-3 size-9"/><div className="font-display text-2xl font-extrabold">{g.name}</div><p className="text-white/90">{g.blurb}</p>
        <span className="mt-3 inline-block rounded-full bg-black/40 px-3 py-1 text-xs font-bold">{g.live ? 'Play on this device' : 'Coming Soon'}</span></button>))}</div>
    <Dialog open={dlg} onClose={() => setDlg(false)} title="Online rooms: coming soon">
      <p className="mb-4 text-white/70">Room codes need a backend. Not built yet. Imposter works now on one shared device.</p>
      <Button className="w-full" onClick={() => nav('/imposter')}>Play Imposter here</Button></Dialog>
  </Shell>)
}
