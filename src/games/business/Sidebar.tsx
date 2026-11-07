import type { ReactNode } from 'react';
import { BOARD } from './board';
import { isCorrupted, netWorth, ownedTiles } from './engine';
import type { GameState, Player } from './types';
import { colorOf, inr, tileBand } from './view';

function PlayerCard({ s, p, isCurrent, onOpenJoker }: { s: GameState; p: Player; isCurrent: boolean; onOpenJoker?: (owner: Player, cardId: string) => void }) {
  const tiles = ownedTiles(s, p.id);
  const marketOn = p.market && s.round >= p.market.from && s.round <= p.market.until;
  return (
    <div className={`rounded-2xl p-4 transition ${isCurrent ? 'bg-white/10 ring-2 ring-lime' : 'bg-white/5'} ${p.bankrupt ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full text-2xl" style={{ background: colorOf(p) }}>{p.token}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-3xl font-extrabold leading-none">{p.name}</div>
          <div className="mt-1 text-sm text-white/50">Worth {inr(netWorth(s, p.id))}</div>
        </div>
        {p.bankrupt ? (
          <span className="rounded-full bg-pink px-3 py-1 text-sm font-bold">Bankrupt</span>
        ) : (
          <span className="font-display text-3xl font-extrabold tabular-nums text-amber">{inr(p.cash)}</span>
        )}
      </div>
      {!p.bankrupt && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.jokers.map((id, k) => (
              <button key={id} type="button" aria-label={`${p.name}'s Joker`} onClick={() => onOpenJoker?.(p, id)} className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-bold outline-none transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white">
                🃏 Joker{p.jokers.length > 1 ? ` ${k + 1}` : ''}
              </button>
            ))}
            {p.jailFreeCards.length > 0 && <span className="rounded-xl bg-lime/20 px-3 py-1.5 text-sm font-bold text-lime">Jail card ×{p.jailFreeCards.length}</span>}
            {p.inJail && <span className="rounded-xl bg-pink/30 px-3 py-1.5 text-sm font-bold text-pink">In Jail</span>}
            {p.speedLimit && <span className="rounded-xl bg-amber/20 px-3 py-1.5 text-sm font-bold text-amber">Speed limit</span>}
            {marketOn && p.market && <span className="rounded-xl bg-purple-500/30 px-3 py-1.5 text-sm font-bold">Market ×{p.market.mult}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tiles.map((i) => {
              const pr = s.properties[i];
              const sealed = s.turns < pr.blockedUntil;
              const tag = pr.mortgaged ? ' (M)' : pr.houses === 5 ? ' 🏨' : pr.houses > 0 ? ` ·${pr.houses}🏠` : '';
              return (
                <span key={i} className={`flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-sm ${pr.mortgaged ? 'opacity-50' : ''}`}>
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: tileBand(s, i) ?? '#fff' }} />
                  <span className="font-bold">{BOARD[i].name}</span>
                  <span className="text-white/60">{tag}{sealed ? ' 🔒' : ''}{isCorrupted(s, i) ? ' ☠' : ''}</span>
                </span>
              );
            })}
            {tiles.length === 0 && <span className="text-sm text-white/40">No property yet</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function Sidebar({ s, children, onOpenJoker }: { s: GameState; children?: ReactNode; onOpenJoker?: (owner: Player, cardId: string) => void }) {
  return (
    <aside className="flex h-full w-[26rem] shrink-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {s.players.map((p, i) => (
          <PlayerCard key={p.id} s={s} p={p} isCurrent={i === s.current && s.phase.t !== 'gameOver'} onOpenJoker={onOpenJoker} />
        ))}
      </div>
      {children}
    </aside>
  );
}
