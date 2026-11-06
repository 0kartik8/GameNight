import type { ReactNode } from 'react';
import { BOARD } from './board';
import { netWorth, ownedTiles } from './engine';
import type { GameState, Player } from './types';
import { colorOf, inr, tileBand } from './view';

function PlayerCard({ s, p, isCurrent }: { s: GameState; p: Player; isCurrent: boolean }) {
  const tiles = ownedTiles(s, p.id);
  return (
    <div className={`rounded-2xl px-3 py-2.5 transition ${isCurrent ? 'bg-white/10 ring-2 ring-lime' : 'bg-white/5'} ${p.bankrupt ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ background: colorOf(p) }}>
          {p.token}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">{p.name}</span>
        {p.bankrupt ? (
          <span className="rounded-full bg-pink px-2 py-0.5 text-xs font-bold">Bankrupt</span>
        ) : (
          <span className="font-display text-xl font-extrabold tabular-nums text-amber">{inr(p.cash)}</span>
        )}
      </div>
      {!p.bankrupt && (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {tiles.map((i) => (
              <span
                key={i}
                title={`${BOARD[i].name}${s.properties[i].mortgaged ? ' (mortgaged)' : ''}`}
                className={`size-3 rounded-sm ${s.properties[i].mortgaged ? 'opacity-30' : ''}`}
                style={{ background: tileBand(s, i) ?? '#fff' }}
              />
            ))}
              {tiles.length === 0 && <span className="text-xs text-white/40">No property yet</span>}
            </div>
            <span className="shrink-0 text-xs text-white/50">Worth {inr(netWorth(s, p.id))}</span>
          </div>
          {(p.inJail || p.jailFreeCards.length > 0 || p.speedLimit) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {p.inJail && <span className="rounded-full bg-pink/30 px-2 text-pink">In Jail</span>}
              {p.jailFreeCards.length > 0 && <span className="rounded-full bg-lime/20 px-2 text-lime">Jail card ×{p.jailFreeCards.length}</span>}
              {p.speedLimit && <span className="rounded-full bg-amber/20 px-2 text-amber">Speed limit</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Sidebar({ s, children }: { s: GameState; children?: ReactNode }) {
  const log = [...s.log].reverse().slice(0, 40);
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2">
        {s.players.map((p, i) => (
          <PlayerCard key={p.id} s={s} p={p} isCurrent={i === s.current && s.phase.t !== 'gameOver'} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white/5 p-3">
        <p className="mb-2 font-display font-extrabold">What happened</p>
        <ul className="space-y-1.5 text-sm">
          {log.map((e, k) => (
            <li key={e.seq} className={k === 0 ? 'text-white' : 'text-white/55'}>
              {e.text}
            </li>
          ))}
        </ul>
      </div>
      {children}
    </aside>
  );
}
