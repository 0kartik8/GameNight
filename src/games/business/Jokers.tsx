import { useState } from 'react';
import { Button } from '../../components/ui';
import { BOARD } from './board';
import { blockedNow, jokerKind, ownedTiles, playerById } from './engine';
import Overlay from './Overlay';
import type { Action, GameState, JokerKind, Player } from './types';
import { colorOf } from './view';

const LABEL: Record<JokerKind, string> = { heist: 'Heist', uno: 'Uno Reverse', block: 'Government seal', jail: 'Get out of Jail' };
const HELP: Record<JokerKind, string> = {
  heist: 'Use it before you roll. Take up to ₹300 from one player.',
  uno: 'Use it on your turn only. It reverses the charge or effect aimed at you.',
  block: 'Use it on your turn. One of your properties collects no rent for 2 turns, and cannot be sold, mortgaged, or auctioned meanwhile.',
  jail: 'Use it while in Jail to leave for free.',
};

/**
 * Private view of one held Joker. The holder hides the screen, taps to reveal, taps to hide again.
 * Actions here are the only way a Joker is used.
 */
export default function JokerReveal({ s, owner, cardId, send, onClose }: { s: GameState; owner: Player; cardId: string; send: (a: Action) => void; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const kind = jokerKind(cardId);
  const ph = s.phase;
  const turn = ph.t === 'turnStart' || ph.t === 'turnEnd';
  const others = s.players.filter((p) => !p.bankrupt && p.id !== owner.id);
  const mine = ownedTiles(s, owner.id).filter((i) => BOARD[i].kind !== 'market' && !blockedNow(s, i));
  const market = owner.market && s.round >= owner.market.from && s.round <= owner.market.until ? owner.market : null;

  return (
    <Overlay title={`${owner.name}'s Joker`} onClose={onClose}>
      {!shown ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-white/70">Hide the screen from everyone else, then tap to look.</p>
          <Button onClick={() => setShown(true)}>Look at my Joker</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
            <span className="grid size-10 place-items-center rounded-full text-xl" style={{ background: colorOf(owner) }}>{owner.token}</span>
            <div>
              <div className="font-display text-2xl font-extrabold text-amber">{LABEL[kind]}</div>
              <p className="text-sm text-white/70">{HELP[kind]}</p>
            </div>
          </div>

          {kind === 'heist' && (
            <div className="space-y-2">
              <p className="text-white/70">Choose a player to rob:</p>
              <div className="flex flex-wrap gap-2">
                {others.map((o) => (
                  <Button key={o.id} variant="ghost" disabled={!turn || ph.t !== 'turnStart'} onClick={() => send({ type: 'USE_JOKER', joker: cardId, target: o.id })}>
                    {o.token} {o.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {kind === 'block' && (
            <div className="space-y-2">
              <p className="text-white/70">Choose one of your properties:</p>
              <div className="flex flex-wrap gap-2">
                {mine.map((i) => (
                  <Button key={i} variant="ghost" disabled={!turn} onClick={() => send({ type: 'USE_JOKER', joker: cardId, tile: i })}>
                    {BOARD[i].name}
                  </Button>
                ))}
                {mine.length === 0 && <p className="text-sm text-white/50">No property to seal right now.</p>}
              </div>
            </div>
          )}

          {kind === 'uno' && (
            <div className="space-y-2">
              {ph.t === 'chance' && ph.debt.debtor === owner.id && (
                <Button className="w-full" onClick={() => send({ type: 'USE_JOKER', joker: cardId })}>
                  Reverse this charge
                </Button>
              )}
              {ph.t === 'turnStart' && owner.heistOwed && (
                <Button className="w-full" variant="ghost" onClick={() => send({ type: 'USE_JOKER', joker: cardId, mode: 'heist' })}>
                  Reverse the Heist: get ₹{owner.heistOwed.amount} back
                </Button>
              )}
              {turn && market && (
                <Button className="w-full" variant="ghost" onClick={() => send({ type: 'USE_JOKER', joker: cardId, mode: 'market' })}>
                  Flip the Stock Market (×{market.mult})
                </Button>
              )}
              {!(ph.t === 'chance' && ph.debt.debtor === owner.id) && !(ph.t === 'turnStart' && owner.heistOwed) && !(turn && market) && (
                <p className="text-sm text-white/50">Nothing to reverse right now. Keep it for a charge aimed at you.</p>
              )}
            </div>
          )}

          {kind === 'jail' && (
            <Button className="w-full" variant="ghost" disabled={!(ph.t === 'turnStart' && owner.inJail)} onClick={() => send({ type: 'USE_JOKER', joker: cardId })}>
              {owner.inJail ? 'Leave Jail with this Joker' : 'Not in Jail'}
            </Button>
          )}

          <Button className="w-full" variant="ghost" onClick={() => setShown(false)}>
            Hide it
          </Button>
          <p className="text-center text-xs text-white/40">{playerById(s, owner.id).name} keeps this Joker until it is used.</p>
        </div>
      )}
    </Overlay>
  );
}

