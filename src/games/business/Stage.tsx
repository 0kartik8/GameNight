import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui';
import { BOARD } from './board';
import { cardById } from './cards';
import { CONFIG } from './config';
import Deed from './Deed';
import { currentPlayer, netWorth, playerById, reduce } from './engine';
import { playSound } from './sound';
import type { Action, GameState, Player } from './types';
import { colorOf, describeEffect, inr } from './view';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// Dice tumble keyframes live here so the game needs no change to index.css.
const TUMBLE_CSS = `
@keyframes bz-tumble { 0% { transform: rotate(0deg) translateY(0) } 25% { transform: rotate(95deg) translateY(-18px) } 50% { transform: rotate(205deg) translateY(0) } 75% { transform: rotate(300deg) translateY(-10px) } 100% { transform: rotate(360deg) translateY(0) } }
.bz-tumble { animation: bz-tumble .5s linear infinite }
@media (prefers-reduced-motion: reduce) { .bz-tumble { animation: none } }`;

function Die({ n, tumbling, ghost }: { n: number; tumbling?: boolean; ghost?: boolean }) {
  return (
    <div
      className={`grid size-16 grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl p-2.5 ${ghost ? 'bg-white/10' : 'bg-white shadow-[0_4px_0_#9ca3af]'} ${tumbling ? 'bz-tumble' : ''}`}
      aria-label={ghost ? 'Dice not rolled yet' : `Die showing ${n}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-full ${!ghost && PIPS[n]?.includes(i) ? 'bg-ink' : ''}`} />
      ))}
    </div>
  );
}

function DiceArea({ faces, tumbling, seq }: { faces: [number, number] | null; tumbling: boolean; seq: number }) {
  if (!faces) {
    return (
      <div className="flex h-16 items-center gap-3">
        <Die n={0} ghost />
        <Die n={0} ghost />
      </div>
    );
  }
  return (
    <div key={tumbling ? 'rolling' : `result-${seq}`} className={`flex h-16 items-center gap-3 ${tumbling ? '' : 'pop'}`}>
      <Die n={faces[0]} tumbling={tumbling} />
      <Die n={faces[1]} tumbling={tumbling} />
      {!tumbling && <span className="ml-1 font-display text-4xl font-extrabold tabular-nums">{faces[0] + faces[1]}</span>}
    </div>
  );
}

function Who({ p, sub, big }: { p: Player; sub: string; big?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`grid place-items-center rounded-full ${big ? 'size-16 text-4xl' : 'size-10 text-2xl'}`} style={{ background: colorOf(p) }}>
        {p.token}
      </span>
      <div className={`font-display font-extrabold leading-none text-amber ${big ? 'text-5xl' : 'text-3xl'}`}>{p.name}</div>
      <div className="text-white/70">{sub}</div>
    </div>
  );
}

function WhoInline({ p, sub }: { p: Player; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-full text-2xl" style={{ background: colorOf(p) }}>
        {p.token}
      </span>
      <div className="text-left">
        <div className="font-display text-2xl font-extrabold leading-none text-amber">{p.name}</div>
        <div className="text-sm text-white/70">{sub}</div>
      </div>
    </div>
  );
}

// The stage is designed for a 540px square and scaled to whatever the board center measures.
const REF = 540;
const rand6 = (): number => 1 + Math.floor(Math.random() * 6);

interface Props {
  s: GameState;
  send: (a: Action) => void;
  openManager: () => void;
  openTrade: () => void;
  /** True while a token is still walking. The next screen waits until it arrives. */
  moving?: boolean;
  onRematch: () => void;
  onNewGame: () => void;
}

export default function Stage({ s, send, openManager, openTrade, moving = false, onRematch, onNewGame }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [rolling, setRolling] = useState<{ faces: [number, number]; settled: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(Math.min(el.clientWidth, el.clientHeight) / REF);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // The engine already knows the roll. Preview it, tumble the dice, land on the real faces, then commit.
  const roll = () => {
    if (rolling) return;
    const preview = reduce(s, { type: 'ROLL' });
    const final = preview.lastRoll;
    if (preview === s || !final) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playSound('diceRoll');
    setRolling({ faces: [rand6(), rand6()], settled: false });
    const tick = window.setInterval(() => setRolling({ faces: [rand6(), rand6()], settled: false }), 90);
    timers.current.push(
      window.setTimeout(() => {
        window.clearInterval(tick);
        playSound('diceLand');
        setRolling({ faces: final, settled: true });
      }, calm ? 120 : 850),
      window.setTimeout(() => {
        setRolling(null);
        send({ type: 'ROLL' });
      }, calm ? 450 : 1550),
    );
    timers.current.push(tick);
  };

  const busy = rolling !== null;
  const ph = s.phase;
  const p = currentPlayer(s);
  const lastLog = s.log.length ? s.log[s.log.length - 1] : null;
  const seq = s.log.length ? s.log[s.log.length - 1].seq : 0;
  const rollSeq = [...s.log].reverse().find((e) => e.kind === 'roll')?.seq ?? 0;
  const roundLabel = s.win.mode === 'rounds' ? `Round ${Math.min(s.round, s.win.rounds)} of ${s.win.rounds}` : `Round ${s.round}`;
  const tumbling = rolling !== null && !rolling.settled;

  let body: ReactNode = null;
  switch (ph.t) {
    case 'turnStart':
      body = (
        <>
          <Who big p={p} sub={p.inJail ? `In Jail. Turn ${p.jailTurns + 1} of ${CONFIG.jailMaxTurns}. Roll doubles to get out.` : 'Your turn'} />
          <DiceArea faces={rolling ? rolling.faces : null} tumbling={tumbling} seq={rollSeq} />
          <div className="flex flex-wrap justify-center gap-3">
            <Button disabled={busy} onClick={roll}>
              {busy ? 'Rolling' : 'Roll dice'}
            </Button>
            {p.inJail && (
              <Button variant="ghost" disabled={busy || p.cash < CONFIG.jailFine} onClick={() => send({ type: 'JAIL_PAY' })}>
                Pay {inr(CONFIG.jailFine)} to leave
              </Button>
            )}
            {p.inJail && p.jailFreeCards.length > 0 && (
              <Button variant="ghost" disabled={busy} onClick={() => send({ type: 'JAIL_USE_CARD' })}>
                Use Jail card
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" disabled={busy} onClick={openManager}>
              Properties
            </Button>
            <Button variant="ghost" disabled={busy} onClick={openTrade}>
              Trade
            </Button>
          </div>
        </>
      );
      break;

    case 'turnEnd':
      body = (
        <>
          <Who big p={p} sub={p.bankrupt ? 'Out of the game' : ph.rollAgain ? 'Doubles! Roll again.' : 'Turn complete'} />
          <DiceArea faces={rolling ? rolling.faces : s.lastRoll && !p.bankrupt ? s.lastRoll : null} tumbling={tumbling} seq={rollSeq} />
          {lastLog && !busy && <p className="max-w-md text-white/80">{lastLog.text}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            {ph.rollAgain ? (
              <Button disabled={busy} onClick={roll}>
                {busy ? 'Rolling' : 'Roll again'}
              </Button>
            ) : (
              <Button onClick={() => send({ type: 'END_TURN' })}>End turn</Button>
            )}
            {!p.bankrupt && (
              <>
                <Button variant="ghost" disabled={busy} onClick={openManager}>
                  Properties
                </Button>
                <Button variant="ghost" disabled={busy} onClick={openTrade}>
                  Trade
                </Button>
              </>
            )}
          </div>
        </>
      );
      break;

    case 'buyOrAuction': {
      const t = BOARD[ph.tile];
      const price = 'price' in t ? t.price : 0;
      body = (
        <>
          <WhoInline p={p} sub={`has ${inr(p.cash)} to spend`} />
          <Deed tile={ph.tile} s={s} />
          <div className="flex flex-wrap justify-center gap-3">
            <Button disabled={p.cash < price} onClick={() => send({ type: 'BUY' })}>
              Buy for {inr(price)}
            </Button>
            <Button variant="ghost" onClick={() => send({ type: 'DECLINE_BUY' })}>
              Start auction
            </Button>
          </div>
        </>
      );
      break;
    }

    case 'auction': {
      const a = ph.auction;
      const turn = playerById(s, a.toAct);
      const high = a.highBidder ? playerById(s, a.highBidder) : null;
      body = (
        <>
          <Deed tile={a.tile} compact s={s} />
          <p className="font-display text-xl font-extrabold">{high ? `${inr(a.highBid)} from ${high.name}` : 'No bids yet'}</p>
          <WhoInline p={turn} sub={`to bid. Cash ${inr(turn.cash)}.`} />
          <p className="text-sm text-white/60">
            Still bidding: {a.inAuction.map((id) => playerById(s, id).name).join(', ')}
            {turn.cash < a.highBid + CONFIG.auction.raiseButtons[0] && `. ${turn.name} cannot afford the next bid.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CONFIG.auction.raiseButtons.map((r) => {
              const amount = a.highBid + r;
              return (
                <Button key={r} disabled={amount > turn.cash} onClick={() => send({ type: 'AUCTION_BID', player: a.toAct, amount })}>
                  Bid {inr(amount)}
                </Button>
              );
            })}
            <Button variant="ghost" onClick={() => send({ type: 'AUCTION_PASS', player: a.toAct })}>
              Pass
            </Button>
          </div>
        </>
      );
      break;
    }

    case 'cardShown': {
      const card = cardById(ph.cardId);
      const kismat = card.deck === 'kismat';
      body = (
        <>
          <WhoInline p={p} sub={kismat ? 'drew a Kismat card' : 'drew a Khazana card'} />
          <div className={`pop w-80 rounded-3xl p-6 shadow-xl ${kismat ? 'bg-violet text-white' : 'bg-amber text-ink'}`}>
            <div className="font-display font-bold">{kismat ? 'Kismat' : 'Khazana'}</div>
            <p className="my-4 font-display text-3xl font-extrabold leading-tight">{card.line}</p>
            <p className="rounded-xl bg-black/20 px-3 py-2 font-bold">{describeEffect(card.effect)}</p>
          </div>
          <Button onClick={() => send({ type: 'ACK_CARD' })}>Got it</Button>
        </>
      );
      break;
    }

    case 'debt': {
      const d = ph.debt;
      const debtor = playerById(s, d.debtor);
      const to = d.payee.kind === 'bank' ? 'the bank' : d.payee.kind === 'pot' ? 'the Free Parking pot' : playerById(s, d.payee.id).name;
      body = (
        <>
          <Who p={debtor} sub={`owes ${inr(d.amount)} to ${to}`} big />
          <p className="max-w-sm text-white/80">
            {d.reason === 'card' ? 'Card payment' : d.reason.charAt(0).toUpperCase() + d.reason.slice(1)}. Cash on hand: {inr(debtor.cash)}. Sell buildings or mortgage property to raise the rest, or go bankrupt.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button disabled={debtor.cash < d.amount} onClick={() => send({ type: 'PAY_DEBT' })}>
              Pay {inr(d.amount)}
            </Button>
            <Button variant="ghost" onClick={openManager}>
              Raise cash
            </Button>
            <Button variant="ghost" className="text-pink" onClick={() => send({ type: 'DECLARE_BANKRUPTCY' })}>
              Declare bankruptcy
            </Button>
          </div>
        </>
      );
      break;
    }

    case 'gameOver': {
      const w = playerById(s, ph.winner);
      const ranked = [...s.players].sort((x, y) => Number(x.bankrupt) - Number(y.bankrupt) || netWorth(s, y.id) - netWorth(s, x.id));
      body = (
        <>
          <div className="text-5xl">🏆</div>
          <h2 className="font-display text-5xl font-extrabold text-lime">{w.name} wins</h2>
          <p className="text-white/70">{ph.reason === 'lastStanding' ? 'Last player standing.' : `Richest after ${s.win.mode === 'rounds' ? s.win.rounds : s.round} rounds.`}</p>
          <ol className="w-72 space-y-1 text-left">
            {ranked.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5">
                <span>{r.token}</span>
                <span className="flex-1 font-bold">{r.name}</span>
                <span className="tabular-nums text-amber">{r.bankrupt ? 'Bankrupt' : inr(netWorth(s, r.id))}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={onRematch}>Play again</Button>
            <Button variant="ghost" onClick={onNewGame}>
              Change players
            </Button>
          </div>
        </>
      );
      break;
    }
  }

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden rounded-2xl bg-ink/60">
      <style>{TUMBLE_CSS}</style>
      <div className="absolute left-1/2 top-1/2 flex flex-col p-4" style={{ width: REF, height: REF, transform: `translate(-50%, -50%) scale(${k})` }}>
        <div className="flex shrink-0 justify-between text-sm text-white/60">
          <span>{roundLabel}</span>
          <span>Free Parking pot {inr(s.pot)}</span>
        </div>
        <div key={`${ph.t}-${seq}`} aria-busy={moving} className={`pop flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center transition-opacity ${moving ? 'pointer-events-none opacity-55' : ''}`}>
          {body}
        </div>
      </div>
    </div>
  );
}
