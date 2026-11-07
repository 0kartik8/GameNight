import { X } from 'lucide-react';
import { BOARD, mortgageValue } from './board';
import { CONFIG } from './config';
import { auctionOwnCheck, blockedNow, bankPrice, buildCheck, currentPlayer, mortgageCheck, ownedTiles, playerById, sellCheck, sellToBankCheck, unmortgageCheck, unmortgageCost } from './engine';
import type { Action, GameState } from './types';
import { inr, tileBand } from './view';

function Mini({ label, reason, onClick }: { label: string; reason: string | null; onClick: () => void }) {
  return (
    <span title={reason ?? undefined}>
      <button
        disabled={reason !== null}
        onClick={onClick}
        className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 disabled:hover:bg-white/10"
      >
        {label}
      </button>
    </span>
  );
}

export default function Manager({ s, send, onClose }: { s: GameState; send: (a: Action) => void; onClose: () => void }) {
  const inDebt = s.phase.t === 'debt';
  const actor = s.phase.t === 'debt' ? playerById(s, s.phase.debt.debtor) : currentPlayer(s);
  const tiles = ownedTiles(s, actor.id).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="pop max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-panel p-6" role="dialog" aria-label={`${actor.name}'s properties`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold">{actor.name}&apos;s properties</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
            <X />
          </button>
        </div>
        <p className="mb-4 text-white/70">
          Cash <b className="text-amber">{inr(actor.cash)}</b>
          {inDebt && s.phase.t === 'debt' && (
            <>
              . You owe <b className="text-pink">{inr(s.phase.debt.amount)}</b>. Sell or mortgage to raise it.
            </>
          )}
          {!inDebt && '. Build evenly across a full color set. Hover a greyed button to see why it is locked.'}
        </p>

        {tiles.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-white/60">No properties yet.</p>}
        <ul className="space-y-2">
          {tiles.map((i) => {
            const t = BOARD[i];
            const pr = s.properties[i];
            if (t.kind === 'start' || !('price' in t)) return null;
            const sealed = blockedNow(s, i) ? ' · sealed by Block' : '';
            const status = pr.mortgaged ? 'Mortgaged' : pr.houses === 5 ? 'Hotel' : pr.houses > 0 ? `${pr.houses} house${pr.houses > 1 ? 's' : ''}` : t.kind === 'city' ? 'No buildings' : '';
            return (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/5 p-3">
                <span className="size-4 shrink-0 rounded" style={{ background: tileBand(s, i) ?? '#fff' }} />
                <span className="min-w-0 flex-1">
                  <span className="font-display font-extrabold">{t.name}</span>
                  {(status || sealed) && <span className="ml-2 text-sm text-white/60">{status}{sealed}</span>}
                </span>
                {t.kind === 'city' && !inDebt && <Mini label={`Build ${inr(t.houseCost)}`} reason={buildCheck(s, i)} onClick={() => send({ type: 'BUILD', tile: i })} />}
                {t.kind === 'city' && pr.houses > 0 && <Mini label={`Sell +${inr(Math.floor(t.houseCost * CONFIG.buildingSellRate))}`} reason={sellCheck(s, i)} onClick={() => send({ type: 'SELL_BUILDING', tile: i })} />}
                {!pr.mortgaged && <Mini label={`Mortgage +${inr(mortgageValue(t.price))}`} reason={mortgageCheck(s, i)} onClick={() => send({ type: 'MORTGAGE', tile: i })} />}
                {pr.mortgaged && !inDebt && <Mini label={`Unmortgage ${inr(unmortgageCost(t.price))}`} reason={unmortgageCheck(s, i)} onClick={() => send({ type: 'UNMORTGAGE', tile: i })} />}
                {!pr.mortgaged && <Mini label={`Sell to bank +${inr(bankPrice(t.price))}`} reason={sellToBankCheck(s, i)} onClick={() => send({ type: 'SELL_TO_BANK', tile: i })} />}
                {!inDebt && <Mini label="Auction it" reason={auctionOwnCheck(s, i)} onClick={() => send({ type: 'AUCTION_OWN', tile: i })} />}
              </li>
            );
          })}
        </ul>
        <button onClick={onClose} className="mt-5 w-full rounded-2xl bg-white/10 px-5 py-3 font-display font-bold outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white">
          Done
        </button>
      </div>
    </div>
  );
}
