import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui';
import { BOARD, GROUP_TILES } from './board';
import type { DeckName } from './board';
import { CONFIG } from './config';
import { currentPlayer, ownedTiles, playerById, tradeCheck, tradeFee } from './engine';
import Overlay from './Overlay';
import type { Action, GameState, Player, TradeOffer, TradeSide } from './types';
import { colorOf, inr, tileBand } from './view';

const DECK_LABEL: Record<DeckName, string> = { kismat: 'Kismat Jail card', khazana: 'Khazana Jail card' };
const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Chip({ on, disabled, title, onClick, children }: { on: boolean; disabled?: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 ${on ? 'bg-lime text-ink' : 'bg-white/10 hover:bg-white/20'}`}
    >
      {children}
    </button>
  );
}

interface SideProps {
  s: GameState;
  owner: Player;
  heading: string;
  cash: number;
  setCash: (n: number) => void;
  tiles: number[];
  setTiles: (t: number[]) => void;
  cards: DeckName[];
  setCards: (c: DeckName[]) => void;
}

function Side({ s, owner, heading, cash, setCash, tiles, setTiles, cards, setCards }: SideProps) {
  const mine = ownedTiles(s, owner.id).sort((a, b) => a - b);
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full text-base" style={{ background: colorOf(owner) }}>
          {owner.token}
        </span>
        <span className="font-display text-lg font-extrabold">{heading}</span>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-white/70">
        Cash
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Cash from ${owner.name}`}
          value={String(cash)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setCash(Math.min(owner.cash, Number(e.target.value.replace(/\D/g, '')) || 0))}
          className="w-28 rounded-xl bg-white/10 px-3 py-1.5 font-display font-bold tabular-nums text-white outline-none focus:ring-2 focus:ring-pink"
        />
        <span className="text-white/50">of {inr(owner.cash)}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {mine.map((i) => {
          const t = BOARD[i];
          const locked = t.kind === 'city' && GROUP_TILES[t.group].some((j) => s.properties[j].houses > 0);
          return (
            <Chip key={i} on={tiles.includes(i)} disabled={locked} title={locked ? 'Sell the buildings in this color set first' : undefined} onClick={() => setTiles(toggle(tiles, i))}>
              <span className="size-3 rounded-sm" style={{ background: tileBand(s, i) ?? '#fff' }} />
              {t.name}
              {s.properties[i].mortgaged && <span className="text-xs opacity-70">mortgaged</span>}
            </Chip>
          );
        })}
        {owner.jailFreeCards.map((d) => (
          <Chip key={d} on={cards.includes(d)} onClick={() => setCards(toggle(cards, d))}>
            {DECK_LABEL[d]}
          </Chip>
        ))}
        {mine.length === 0 && owner.jailFreeCards.length === 0 && <span className="text-sm text-white/50">No properties or cards to offer.</span>}
      </div>
    </div>
  );
}

/** Mortgage fee lines for tiles that arrive mortgaged. */
function feeNotes(s: GameState, tiles: number[], receiver: Player): string[] {
  return tiles
    .filter((i) => s.properties[i].mortgaged)
    .map((i) => {
      const t = BOARD[i];
      return `${receiver.name} pays the bank ${inr('price' in t ? tradeFee(t.price) : 0)} because ${t.name} is mortgaged.`;
    });
}

export function TradeCompose({ s, send, onClose }: { s: GameState; send: (a: Action) => void; onClose: () => void }) {
  const me = currentPlayer(s);
  const partners = s.players.filter((p) => !p.bankrupt && p.id !== me.id);
  const [toId, setToId] = useState(partners[0]?.id ?? '');
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const [giveTiles, setGiveTiles] = useState<number[]>([]);
  const [getTiles, setGetTiles] = useState<number[]>([]);
  const [giveCards, setGiveCards] = useState<DeckName[]>([]);
  const [getCards, setGetCards] = useState<DeckName[]>([]);
  const partner = partners.find((p) => p.id === toId);

  const pick = (id: string) => {
    setToId(id);
    setGetCash(0);
    setGetTiles([]);
    setGetCards([]);
  };

  if (!partner) return null;
  const offer: TradeOffer = {
    from: me.id,
    to: partner.id,
    give: { cash: giveCash, tiles: giveTiles, jailFree: giveCards },
    get: { cash: getCash, tiles: getTiles, jailFree: getCards },
  };
  const problem = tradeCheck(s, offer);
  const notes = [...feeNotes(s, getTiles, me), ...feeNotes(s, giveTiles, partner)];

  return (
    <Overlay title="Propose a trade" onClose={onClose} wide>
      <p className="mb-3 text-white/70">Trade with:</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {partners.map((p) => (
          <Chip key={p.id} on={p.id === toId} onClick={() => pick(p.id)}>
            <span>{p.token}</span>
            {p.name}
          </Chip>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Side s={s} owner={me} heading={`${me.name} gives`} cash={giveCash} setCash={setGiveCash} tiles={giveTiles} setTiles={setGiveTiles} cards={giveCards} setCards={setGiveCards} />
        <Side s={s} owner={partner} heading={`${partner.name} gives`} cash={getCash} setCash={setGetCash} tiles={getTiles} setTiles={setGetTiles} cards={getCards} setCards={setGetCards} />
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-amber">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="mt-4 rounded-2xl bg-pink/20 px-4 py-3 text-pink">
          {problem === 'Empty trade' ? 'Pick something to trade first.' : problem}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={problem !== null}
          onClick={() => {
            send({ type: 'TRADE_PROPOSE', offer });
            onClose();
          }}
        >
          Offer to {partner.name}
        </Button>
      </div>
    </Overlay>
  );
}

function SideList({ s, side, receiver }: { s: GameState; side: TradeSide; receiver: Player }) {
  const rows: ReactNode[] = [];
  if (side.cash > 0)
    rows.push(
      <li key="cash" className="font-bold text-amber">
        {inr(side.cash)} cash
      </li>,
    );
  for (const i of side.tiles) {
    const t = BOARD[i];
    rows.push(
      <li key={i} className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-sm" style={{ background: tileBand(s, i) ?? '#fff' }} />
        <span className="font-bold">{t.name}</span>
        {s.properties[i].mortgaged && <span className="text-xs text-pink">mortgaged</span>}
      </li>,
    );
  }
  for (const d of side.jailFree) rows.push(<li key={d}>{DECK_LABEL[d]}</li>);
  if (rows.length === 0) return <p className="text-white/50">Nothing</p>;
  return <ul className="space-y-1">{rows}</ul>;
}

/** Shown to everyone while an offer is open. The partner taps Accept or Decline. */
export function TradeReview({ s, send }: { s: GameState; send: (a: Action) => void }) {
  const t = s.pendingTrade;
  if (!t) return null;
  const from = playerById(s, t.from);
  const to = playerById(s, t.to);
  const notes = [...feeNotes(s, t.get.tiles, from), ...feeNotes(s, t.give.tiles, to)];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div role="dialog" aria-modal="true" aria-label="Trade offer" className="pop max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-panel p-6">
        <h2 className="font-display text-2xl font-extrabold">
          {from.name} offers {to.name} a trade
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-2 font-display font-extrabold">
              {from.token} {from.name} gives
            </p>
            <SideList s={s} side={t.give} receiver={to} />
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-2 font-display font-extrabold">
              {to.token} {to.name} gives
            </p>
            <SideList s={s} side={t.get} receiver={from} />
          </div>
        </div>
        {notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-amber">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-white/70">
          {to.name}, do you accept? Mortgaged tiles stay mortgaged. Mortgage fee is {Math.round(CONFIG.tradeMortgagedFee * 100)}% of the mortgage value, paid by whoever receives the tile.
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => send({ type: 'TRADE_DECLINE' })}>
            Decline
          </Button>
          <Button className="flex-1" onClick={() => send({ type: 'TRADE_ACCEPT' })}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}

