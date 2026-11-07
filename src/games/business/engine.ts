import { BOARD, GROUP_TILES, HOLY_TILES, RAIL_TILES, UTILITY_TILES, POS, isOwnable, mortgageValue } from './board';
import type { DeckName } from './board';
import { cardById, cardsOf } from './cards';
import type { Card } from './cards';
import { CONFIG } from './config';
import type { Action, Debt, EventKind, GameState, JokerKind, Payee, Phase, Player, PlayerId, PlayerStats, PropertyState, TradeOffer, TradeSide, WinCondition } from './types';

// Pure engine. No React. State is plain JSON. reduce(state, action) never mutates its input.
// reduce returns the SAME object when an action is illegal right now.

const N = BOARD.length;
const DECK_LABEL: Record<DeckName, string> = { kismat: 'Kismat', khazana: 'Khazana' };
const roundTo5 = (n: number): number => Math.round(n / 5) * 5;

// ---------------------------------------------------------------- RNG
function rand(s: GameState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = (s: GameState): number => 1 + Math.floor(rand(s) * 6);
function shuffled<T>(s: GameState, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T,>(s: GameState, xs: readonly T[]): T => xs[Math.floor(rand(s) * xs.length)];

// ---------------------------------------------------------------- selectors
export const currentPlayer = (s: GameState): Player => s.players[s.current];
export function playerById(s: GameState, id: PlayerId): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}
export const alivePlayers = (s: GameState): Player[] => s.players.filter((p) => !p.bankrupt);
export const ownedTiles = (s: GameState, id: PlayerId): number[] =>
  Object.keys(s.properties).map(Number).filter((i) => s.properties[i].owner === id);
const diceTotal = (s: GameState): number => (s.lastRoll ? s.lastRoll[0] + s.lastRoll[1] : 7);
export const jokerKind = (id: string): JokerKind => {
  const e = cardById(id).effect;
  if (e.type !== 'joker') throw new Error(`${id} is not a Joker`);
  return e.kind;
};
export const blockedNow = (s: GameState, tile: number): boolean => s.turns < (s.properties[tile]?.blockedUntil ?? 0);
const TOLL_TILES = BOARD.flatMap((t, i) => (t.kind === 'toll' ? [i] : []));

/** Multiplier on rent this owner RECEIVES right now (Stock Market). Rent paid is never affected. */
export function marketMult(s: GameState, ownerId: PlayerId): number {
  const m = playerById(s, ownerId).market;
  return m && s.round >= m.from && s.round <= m.until ? m.mult : 1;
}

/** Base rent of a tile at this moment, before any Stock Market multiplier and bribes. */
export function rentFor(s: GameState, tile: number, dice: number): number {
  const t = BOARD[tile];
  const pr = s.properties[tile];
  if (!pr || pr.owner === null || pr.mortgaged || blockedNow(s, tile)) return 0;
  const owner = pr.owner;
  const count = (idxs: number[]): number => idxs.filter((i) => s.properties[i].owner === owner).length;
  switch (t.kind) {
    case 'city': {
      if (pr.houses > 0) return t.rent[pr.houses];
      const full = GROUP_TILES[t.group].every((i) => s.properties[i].owner === owner);
      return full ? t.rent[0] * 2 : t.rent[0];
    }
    case 'toll':
      return t.base + t.rise * pr.raises;
    case 'holy': {
      // A pair only counts when both cities are in the same state (both holy, or both corrupted).
      const corrupt = isCorrupted(s, tile);
      const same = HOLY_TILES.filter((i) => s.properties[i].owner === owner && isCorrupted(s, i) === corrupt).length;
      return t.rent[same - 1];
    }
    case 'rail':
      return t.rent[count(RAIL_TILES) - 1];
    case 'utility':
      return dice * (count(UTILITY_TILES) === 2 ? CONFIG.utilityMultiplier.both : CONFIG.utilityMultiplier.one);
    default:
      return 0;
  }
}

export function netWorth(s: GameState, id: PlayerId): number {
  let w = playerById(s, id).cash;
  for (const i of ownedTiles(s, id)) {
    const t = BOARD[i];
    const pr = s.properties[i];
    if (!isOwnable(t)) continue;
    w += pr.mortgaged ? mortgageValue(t.price) : t.price;
    if (t.kind === 'city') w += pr.houses * t.houseCost;
  }
  return w;
}

// ---------------------------------------------------------------- holy cities
/** A holy city that has taken enough donations is corrupted for good. */
export function isCorrupted(s: GameState, tile: number): boolean {
  return BOARD[tile].kind === 'holy' && s.properties[tile].donations >= CONFIG.holy.corruptAfter;
}
export const corruptedCount = (s: GameState): number => HOLY_TILES.filter((i) => isCorrupted(s, i)).length;
/** What visitors to a corrupted city pay its owner on top of rent, right now. */
export const bribeNow = (s: GameState): number => CONFIG.holy.bribe[Math.max(1, corruptedCount(s)) - 1];

const mortgageTotal = (s: GameState, id: PlayerId): number =>
  ownedTiles(s, id).reduce((sum, i) => {
    const t = BOARD[i];
    return sum + (isOwnable(t) ? mortgageValue(t.price) : 0);
  }, 0);

/**
 * Who gets a donation: the poorest other player by cash. A tie is broken by the lower total mortgage value of
 * owned properties. If that is still a tie, the money goes into the pot.
 */
export function poorestOther(s: GameState, landerId: PlayerId): Payee {
  const rows = alivePlayers(s)
    .filter((p) => p.id !== landerId)
    .map((p) => ({ id: p.id, cash: p.cash, props: mortgageTotal(s, p.id) }))
    .sort((a, b) => a.cash - b.cash || a.props - b.props);
  if (rows.length === 0) return { kind: 'pot' };
  const tied = rows.filter((r) => r.cash === rows[0].cash && r.props === rows[0].props);
  return tied.length > 1 ? { kind: 'pot' } : { kind: 'player', id: rows[0].id };
}

// ---------------------------------------------------------------- log and stats
function log(s: GameState, kind: EventKind, text: string, extra: { player?: PlayerId; tile?: number; amount?: number } = {}): void {
  const seq = s.log.length ? s.log[s.log.length - 1].seq + 1 : 1;
  s.log.push({ seq, kind, text, ...extra });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}
export const emptyStats = (): PlayerStats => ({
  rentIn: 0, rentOut: 0, bribeIn: 0, donationsOut: 0, jailed: 0, auctionsWon: 0, corrupted: 0,
  jokers: { heist: 0, uno: 0, block: 0, jail: 0 },
});

// ---------------------------------------------------------------- start
export function startGame(entries: { name: string; token: string }[], win: WinCondition, seed: number): GameState {
  if (entries.length < CONFIG.players.min || entries.length > CONFIG.players.max) {
    throw new Error(`Players must be ${CONFIG.players.min}-${CONFIG.players.max}`);
  }
  const properties: Record<number, PropertyState> = {};
  BOARD.forEach((t, i) => {
    if (isOwnable(t)) properties[i] = { owner: null, mortgaged: false, houses: 0, donations: 0, raises: 0, blockedUntil: 0 };
  });
  const s: GameState = {
    version: 1,
    rngState: seed >>> 0,
    players: entries.map((e, i) => ({
      id: `p${i + 1}`,
      name: e.name,
      token: e.token,
      cash: CONFIG.startCash,
      position: POS.start,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: [],
      speedLimit: false,
      doublesInRow: 0,
      bankrupt: false,
      jokers: [],
      market: null,
      heistOwed: null,
      stats: emptyStats(),
    })),
    current: 0,
    round: 1,
    turns: 0,
    win,
    properties,
    houseStock: CONFIG.supply.houses,
    hotelStock: CONFIG.supply.hotels,
    decks: { kismat: { drawPile: [] }, khazana: { drawPile: [] } },
    pot: 0,
    phase: { t: 'turnStart' },
    lastRoll: null,
    pendingTrade: null,
    debtQueue: [],
    pendingMove: null,
    pendingBuy: null,
    pendingAuctions: [],
    resumePhase: null,
    endVotes: [],
    endPending: false,
    log: [],
  };
  for (const d of ['kismat', 'khazana'] as const) {
    s.decks[d].drawPile = shuffled(s, cardsOf(d).map((c) => c.id));
  }
  // Opening rolls: highest total goes first. Ties re-roll among the tied.
  let cands = s.players.map((p) => p.id);
  while (cands.length > 1) {
    const res = cands.map((id) => ({ id, t: die(s) + die(s) }));
    const max = Math.max(...res.map((r) => r.t));
    log(s, 'roll', `Opening rolls: ${res.map((r) => `${playerById(s, r.id).name} ${r.t}`).join(', ')}.`);
    cands = res.filter((r) => r.t === max).map((r) => r.id);
  }
  const first = s.players.findIndex((p) => p.id === cands[0]);
  s.players = [...s.players.slice(first), ...s.players.slice(0, first)];
  log(s, 'round', `${s.players[0].name} goes first.`, { player: s.players[0].id });
  return s;
}

// ---------------------------------------------------------------- money
function owe(s: GameState, debtor: PlayerId, payee: Payee, amount: number, reason: string, kind: EventKind, holyTile?: number): void {
  if (amount <= 0) return;
  s.debtQueue.push({ debtor, payee, amount, reason, kind, holyTile });
}

function transfer(s: GameState, d: Debt): void {
  const from = playerById(s, d.debtor);
  from.cash -= d.amount;
  let to = '';
  if (d.payee.kind === 'player') {
    const c = playerById(s, d.payee.id);
    c.cash += d.amount;
    to = ` to ${c.name}`;
    if (d.kind === 'rent') { c.stats.rentIn += d.amount; from.stats.rentOut += d.amount; }
    if (d.kind === 'bribe') c.stats.bribeIn += d.amount;
    if (d.kind === 'donate') from.stats.donationsOut += d.amount;
  } else if (d.payee.kind === 'pot') {
    s.pot += d.amount;
    to = ' into the pot';
  }
  // 'bank' and 'nowhere': the money simply leaves the player
  log(s, d.kind, `${from.name} pays ₹${d.amount}${to} (${d.reason}).`, { player: from.id, amount: d.amount });
  if (d.holyTile !== undefined) {
    // Only a paid donation counts toward corruption.
    const pr = s.properties[d.holyTile];
    pr.donations += 1;
    if (pr.donations === CONFIG.holy.corruptAfter) {
      if (pr.owner) playerById(s, pr.owner).stats.corrupted += 1;
      log(s, 'corrupt', `${BOARD[d.holyTile].name} is now corrupted!`, { tile: d.holyTile });
    }
  }
}

/** Is a debt one Uno Reverse can turn around? Rent, bribes and card payments. Not tax, donations or Jail fines. */
const reversible = (k: EventKind): boolean => k === 'rent' || k === 'bribe' || k === 'card';
const hasUno = (p: Player): boolean => p.jokers.some((id) => jokerKind(id) === 'uno');

// Pay queued debts in order. Stops at the first one the debtor cannot cover, or where they may use Uno Reverse.
// When the queue is empty, finishes the current resolution.
function settle(s: GameState): void {
  while (s.debtQueue.length > 0) {
    const d = s.debtQueue[0];
    const debtor = playerById(s, d.debtor);
    if (debtor.bankrupt) {
      s.debtQueue.shift();
      continue;
    }
    if (debtor.id === currentPlayer(s).id && !d.offered && reversible(d.kind) && hasUno(debtor)) {
      d.offered = true;
      s.phase = { t: 'chance', debt: d };
      return;
    }
    if (debtor.cash >= d.amount) {
      s.debtQueue.shift();
      transfer(s, d);
      continue;
    }
    s.phase = { t: 'debt', debt: d };
    return;
  }
  const p = currentPlayer(s);
  if (s.pendingMove !== null) {
    const steps = s.pendingMove;
    s.pendingMove = null;
    if (!p.bankrupt) {
      moveByRoll(s, p, steps);
      return;
    }
  }
  if (s.pendingBuy !== null) {
    const tile = s.pendingBuy;
    s.pendingBuy = null;
    if (!p.bankrupt) {
      s.phase = { t: 'buyOrAuction', tile };
      return;
    }
  }
  if (s.resumePhase !== null) {
    s.phase = s.resumePhase;
    s.resumePhase = null;
    return;
  }
  finishResolution(s);
}

function finishResolution(s: GameState): void {
  if (s.phase.t === 'gameOver') return;
  const p = currentPlayer(s);
  s.phase = { t: 'turnEnd', rollAgain: p.doublesInRow > 0 && !p.inJail && !p.bankrupt };
}

// ---------------------------------------------------------------- movement
function salary(s: GameState, p: Player): void {
  p.cash += CONFIG.salary;
  log(s, 'salary', `${p.name} collects salary ₹${CONFIG.salary}.`, { player: p.id, amount: CONFIG.salary });
}

function relocate(s: GameState, p: Player, dest: number, passedStart: boolean): void {
  p.position = dest;
  log(s, 'move', `${p.name} moves to ${BOARD[dest].name}.`, { player: p.id, tile: dest });
  if (passedStart) salary(s, p);
  land(s, p);
}

function moveByRoll(s: GameState, p: Player, total: number): void {
  if (p.speedLimit) {
    p.speedLimit = false;
    if (total > CONFIG.speedLimitMaxRoll) {
      log(s, 'jail', `Speed limit! ${p.name} rolled over ${CONFIG.speedLimitMaxRoll}.`, { player: p.id });
      sendToJail(s, p);
      return;
    }
  }
  const raw = p.position + total;
  relocate(s, p, raw % N, raw >= N);
}

function sendToJail(s: GameState, p: Player): void {
  p.position = POS.jail;
  p.inJail = true;
  p.jailTurns = 0;
  p.doublesInRow = 0;
  p.speedLimit = false;
  p.stats.jailed += 1;
  log(s, 'jail', `${p.name} goes to Jail.`, { player: p.id, tile: POS.jail });
  settle(s);
}

function leaveJail(s: GameState, p: Player, text: string): void {
  p.inJail = false;
  p.jailTurns = 0;
  log(s, 'jailExit', text, { player: p.id });
}

// ---------------------------------------------------------------- landing
function land(s: GameState, p: Player): void {
  const t = BOARD[p.position];
  switch (t.kind) {
    case 'freeParking':
      if (s.pot > 0) {
        p.cash += s.pot;
        log(s, 'pot', `${p.name} collects ₹${s.pot} from the pot.`, { player: p.id, amount: s.pot });
        s.pot = 0;
      }
      return settle(s);
    case 'goToJail':
      return sendToJail(s, p);
    case 'tax':
      owe(s, p.id, { kind: 'pot' }, t.amount, t.name, 'tax');
      return settle(s);
    case 'card':
      return drawCard(s, p, t.deck);
    case 'market': {
      // Not buyable. The multiplier applies to rent this player receives, for the next rounds.
      const mult = pick(s, CONFIG.market.multipliers);
      p.market = { mult, from: s.round + 1, until: s.round + CONFIG.market.rounds };
      log(s, 'market', `${p.name} lands on the Stock Market. Rent received is ×${mult} for the next ${CONFIG.market.rounds} rounds.`, { player: p.id });
      return settle(s);
    }
    case 'city':
    case 'holy':
    case 'rail':
    case 'utility':
    case 'toll':
      return landOnProperty(s, p);
    default:
      return settle(s); // Start, Jail (just visiting)
  }
}

function landOnProperty(s: GameState, p: Player): void {
  const i = p.position;
  const pr = s.properties[i];
  const t = BOARD[i];
  const donates = t.kind === 'holy' && !isCorrupted(s, i);
  if (pr.owner !== null && pr.owner !== p.id) {
    const owner = playerById(s, pr.owner);
    const base = rentFor(s, i, diceTotal(s)); // 0 when mortgaged or sealed by Block
    const mult = marketMult(s, owner.id);
    const rent = base > 0 && mult !== 1 ? roundTo5(base * mult) : base;
    owe(s, p.id, { kind: 'player', id: owner.id }, rent, `rent for ${t.name}`, 'rent');
    // A corrupted city adds a bribe for its owner. Not paid while the city is mortgaged.
    if (t.kind === 'holy' && isCorrupted(s, i) && !pr.mortgaged) {
      owe(s, p.id, { kind: 'player', id: owner.id }, bribeNow(s), `bribe at ${t.name}`, 'bribe');
    }
  }
  // Holy cities that are not corrupted yet: everyone who lands donates, owner included.
  if (donates) owe(s, p.id, poorestOther(s, p.id), CONFIG.holy.donation, `donation at ${t.name}`, 'donate', i);
  if (pr.owner === null) s.pendingBuy = i; // offer it for sale once the donation, if any, is paid
  settle(s);
}

// ---------------------------------------------------------------- cards
function drawCard(s: GameState, p: Player, deck: DeckName): void {
  const pile = s.decks[deck].drawPile;
  const id = pile.shift();
  if (id === undefined) throw new Error(`Deck ${deck} is empty`);
  const card = cardById(id);
  // Held cards (Jokers and plain Get-out-of-Jail) leave the pile until used.
  if (card.effect.type !== 'jailFree' && card.effect.type !== 'joker') pile.push(id);
  // Random moves are rolled now, so everyone sees the number on the card.
  const roll = card.effect.type === 'rollMove' ? die(s) : undefined;
  s.phase = { t: 'cardShown', cardId: id, roll };
  log(s, 'card', `${p.name} draws ${DECK_LABEL[deck]}: "${card.line}"`, { player: p.id });
}

function returnHeldCard(s: GameState, id: string): void {
  const c = cardById(id);
  s.decks[c.deck].drawPile.push(id);
}

function applyCard(s: GameState, p: Player, card: Card, roll: number | undefined): void {
  const e = card.effect;
  const others = (): Player[] => alivePlayers(s).filter((x) => x.id !== p.id);
  switch (e.type) {
    case 'collect':
      p.cash += e.amount;
      log(s, 'card', `${p.name} collects ₹${e.amount}.`, { player: p.id, amount: e.amount });
      return settle(s);
    case 'payPot':
      owe(s, p.id, { kind: 'pot' }, e.amount, 'card fine', 'card');
      return settle(s);
    case 'payNowhere':
      owe(s, p.id, { kind: 'nowhere' }, e.amount, 'card', 'card');
      return settle(s);
    case 'moveTo':
      return relocate(s, p, e.tile, e.tile < p.position);
    case 'rollMove': {
      const steps = roll ?? 1;
      log(s, 'move', `${p.name} moves ${e.dir > 0 ? 'forward' : 'back'} ${steps} tile${steps > 1 ? 's' : ''}.`, { player: p.id, amount: steps });
      if (e.dir > 0) {
        const raw = p.position + steps;
        return relocate(s, p, raw % N, raw >= N);
      }
      return relocate(s, p, (p.position - steps + N) % N, false);
    }
    case 'goToJail':
      return sendToJail(s, p);
    case 'jailFree':
      p.jailFreeCards.push(card.deck);
      log(s, 'card', `${p.name} keeps a Get out of Jail free card.`, { player: p.id });
      return settle(s);
    case 'joker':
      p.jokers.push(card.id);
      log(s, 'joker', `${p.name} keeps a Joker.`, { player: p.id });
      return settle(s);
    case 'speedLimit':
      p.speedLimit = true;
      log(s, 'card', `${p.name}: next roll over ${CONFIG.speedLimitMaxRoll} sends you to Jail.`, { player: p.id });
      return settle(s);
    case 'payEachPlayer':
      for (const o of others()) owe(s, p.id, { kind: 'player', id: o.id }, e.amount, 'card', 'card');
      return settle(s);
    case 'collectFromEach':
      for (const o of others()) owe(s, o.id, { kind: 'player', id: p.id }, e.amount, 'card', 'card');
      return settle(s);
    case 'repairs': {
      let houses = 0;
      let hotels = 0;
      for (const i of ownedTiles(s, p.id)) {
        const h = s.properties[i].houses;
        if (h === 5) hotels++;
        else houses += h;
      }
      owe(s, p.id, { kind: 'bank' }, houses * e.perHouse + hotels * e.perHotel, 'repairs', 'card');
      return settle(s);
    }
  }
}

// ---------------------------------------------------------------- auctions
function startAuction(s: GameState, tile: number, why: string, seller: PlayerId | null = null): void {
  const order: PlayerId[] = [];
  for (let k = 1; k <= s.players.length; k++) {
    const q = s.players[(s.current + k) % s.players.length];
    if (!q.bankrupt && q.id !== seller) order.push(q.id);
  }
  s.phase = { t: 'auction', auction: { tile, highBid: 0, highBidder: null, inAuction: order, toAct: order[0], seller } };
  log(s, 'auction', why, { tile });
}

const minBid = (highBid: number): number => (highBid === 0 ? CONFIG.auction.openingBid : highBid + CONFIG.auction.raiseButtons[0]);

function afterAuction(s: GameState): void {
  const next = s.pendingAuctions.shift();
  if (next !== undefined) {
    startAuction(s, next, `${BOARD[next].name} is auctioned from the bankruptcy.`);
    return;
  }
  settle(s);
}

function checkAuctionEnd(s: GameState): void {
  if (s.phase.t !== 'auction') return;
  const a = s.phase.auction;
  const t = BOARD[a.tile];
  if (a.inAuction.length === 0) {
    log(s, 'auction', `No bids. ${t.name} stays ${a.seller ? 'with its owner' : 'unowned'}.`, { tile: a.tile });
    return afterAuction(s);
  }
  if (a.inAuction.length === 1 && a.highBidder === a.inAuction[0]) {
    const w = playerById(s, a.highBidder);
    w.cash -= a.highBid;
    w.stats.auctionsWon += 1;
    if (a.seller) playerById(s, a.seller).cash += a.highBid; // an owner's sale: the money goes to the owner
    s.properties[a.tile].owner = w.id;
    log(s, 'auction', `${w.name} wins ${t.name} for ₹${a.highBid}${a.seller ? ` from ${playerById(s, a.seller).name}` : ''}.`, { player: w.id, tile: a.tile, amount: a.highBid });
    afterAuction(s);
  }
}

// ---------------------------------------------------------------- bankruptcy and turns
function liquidateBuildings(s: GameState, id: PlayerId): number {
  let cash = 0;
  for (const i of ownedTiles(s, id)) {
    const t = BOARD[i];
    const pr = s.properties[i];
    if (t.kind !== 'city' || pr.houses === 0) continue;
    cash += pr.houses * Math.floor(t.houseCost * CONFIG.buildingSellRate);
    if (pr.houses === 5) s.hotelStock += 1;
    else s.houseStock += pr.houses;
    pr.houses = 0;
  }
  return cash;
}

function bankrupt(s: GameState, id: PlayerId, payee: Payee): void {
  const p = playerById(s, id);
  const tiles = ownedTiles(s, id);
  log(s, 'bankrupt', `${p.name} is bankrupt.`, { player: id });
  p.cash += liquidateBuildings(s, id);
  if (payee.kind === 'player') {
    const c = playerById(s, payee.id);
    c.cash += p.cash;
    for (const i of tiles) s.properties[i].owner = c.id;
    c.jailFreeCards.push(...p.jailFreeCards);
    c.jokers.push(...p.jokers);
  } else {
    // Assets return to the bank: unowned, unmortgaged, and auctioned one by one. Toll level and donations stay.
    for (const i of tiles) {
      const pr = s.properties[i];
      s.properties[i] = { owner: null, mortgaged: false, houses: 0, donations: pr.donations, raises: pr.raises, blockedUntil: 0 };
    }
    s.pendingAuctions = [...tiles];
    for (const d of p.jailFreeCards) returnJailCard(s, d);
    for (const j of p.jokers) returnHeldCard(s, j);
  }
  p.cash = 0;
  p.jailFreeCards = [];
  p.jokers = [];
  p.bankrupt = true;
  p.inJail = false;
  p.speedLimit = false;
  p.doublesInRow = 0;
  p.market = null;
  p.heistOwed = null;
  const alive = alivePlayers(s);
  if (alive.length === 1) {
    s.pendingAuctions = [];
    s.phase = { t: 'gameOver', winner: alive[0].id, reason: 'lastStanding' };
    log(s, 'win', `${alive[0].name} wins as last player standing.`, { player: alive[0].id });
  }
}

function returnJailCard(s: GameState, deck: DeckName): void {
  const c = cardsOf(deck).find((x) => x.effect.type === 'jailFree');
  if (c) s.decks[deck].drawPile.push(c.id);
}

function endByNetWorth(s: GameState): void {
  const ranked = alivePlayers(s)
    .map((p) => ({ p, w: netWorth(s, p.id) }))
    .sort((x, y) => y.w - x.w || y.p.cash - x.p.cash);
  const top = ranked[0];
  s.phase = { t: 'gameOver', winner: top.p.id, reason: 'netWorth' };
  log(s, 'win', `${top.p.name} wins with net worth ₹${top.w}.`, { player: top.p.id, amount: top.w });
}

function advanceTurn(s: GameState): void {
  const n = s.players.length;
  let i = s.current;
  do {
    i = (i + 1) % n;
  } while (s.players[i].bankrupt);
  if (i <= s.current) {
    s.round += 1;
    // Sarkari Toll: its rent rises once per round.
    for (const t of TOLL_TILES) s.properties[t].raises += 1;
    if (s.win.mode === 'rounds' && s.round > s.win.rounds) {
      endByNetWorth(s);
      return;
    }
    log(s, 'round', `Round ${s.round} begins.`);
  }
  s.current = i;
  s.phase = { t: 'turnStart' };
}

// ---------------------------------------------------------------- roll
function doRoll(s: GameState): boolean {
  const ph = s.phase;
  if (!(ph.t === 'turnStart' || (ph.t === 'turnEnd' && ph.rollAgain))) return false;
  const p = currentPlayer(s);
  const a = die(s);
  const b = die(s);
  const total = a + b;
  const dbl = a === b;
  s.lastRoll = [a, b];
  log(s, 'roll', `${p.name} rolls ${a} + ${b} = ${total}${dbl ? ' (doubles)' : ''}.`, { player: p.id, amount: total });

  if (p.inJail) {
    if (dbl) {
      leaveJail(s, p, `${p.name} rolls doubles and leaves Jail.`);
      moveByRoll(s, p, total);
      return true;
    }
    p.jailTurns += 1;
    if (p.jailTurns >= CONFIG.jailMaxTurns) {
      leaveJail(s, p, `${p.name} pays the ₹${CONFIG.jailFine} fine after 3 turns.`);
      owe(s, p.id, { kind: 'bank' }, CONFIG.jailFine, 'jail fine', 'jailExit');
      s.pendingMove = total;
      settle(s);
      return true;
    }
    log(s, 'jail', `${p.name} stays in Jail.`, { player: p.id });
    s.phase = { t: 'turnEnd', rollAgain: false };
    return true;
  }

  p.doublesInRow = dbl ? p.doublesInRow + 1 : 0;
  if (p.doublesInRow >= CONFIG.maxDoublesBeforeJail) {
    log(s, 'jail', `${p.name} rolled doubles ${CONFIG.maxDoublesBeforeJail} times.`, { player: p.id });
    sendToJail(s, p);
    return true;
  }
  moveByRoll(s, p, total);
  return true;
}

// ---------------------------------------------------------------- buildings, selling, mortgage, Jokers, trade
const onTurn = (s: GameState): boolean => s.phase.t === 'turnStart' || s.phase.t === 'turnEnd';
const raising = (s: GameState): boolean => s.phase.t === 'debt' || s.phase.t === 'chance';
const badTile = (tile: number): boolean => !Number.isInteger(tile) || tile < 0 || tile >= N;
const groupHouses = (s: GameState, group: number[]): number[] => group.map((i) => s.properties[i].houses);
const ceilFee = (rate: number, base: number): number => Math.ceil(base * rate - 1e-9);

export const unmortgageCost = (price: number): number => {
  const mv = mortgageValue(price);
  return mv + ceilFee(CONFIG.unmortgageInterest, mv);
};
export const tradeFee = (price: number): number => ceilFee(CONFIG.tradeMortgagedFee, mortgageValue(price));
const sellValue = (houseCost: number): number => Math.floor(houseCost * CONFIG.buildingSellRate);
/** What the bank pays for a property sold back: a share of its price, rounded to ₹5. */
export const bankPrice = (price: number): number => roundTo5(price * CONFIG.sellRate);

// Who acts on manager actions: the debtor while raising cash, else the player on turn.
function actor(s: GameState): Player {
  return raising(s) ? playerById(s, (s.phase as { debt: Debt }).debt.debtor) : currentPlayer(s);
}

export function buildCheck(s: GameState, tile: number): string | null {
  if (!onTurn(s)) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const p = currentPlayer(s);
  if (t.kind !== 'city') return 'Only cities take buildings';
  const pr = s.properties[tile];
  if (pr.owner !== p.id) return 'You do not own this tile';
  if (blockedNow(s, tile)) return 'Sealed by Block';
  const group = GROUP_TILES[t.group];
  if (!group.every((i) => s.properties[i].owner === p.id)) return 'Own the full color group first';
  if (group.some((i) => s.properties[i].mortgaged)) return 'A tile in this group is mortgaged';
  if (pr.houses >= 5) return 'Already a hotel';
  if (pr.houses > Math.min(...groupHouses(s, group))) return 'Build evenly across the group';
  if (pr.houses === 4 && s.hotelStock <= 0) return 'No hotels left';
  if (pr.houses < 4 && s.houseStock <= 0) return 'No houses left';
  if (p.cash < t.houseCost) return 'Not enough cash';
  return null;
}

export function sellCheck(s: GameState, tile: number): string | null {
  if (!(onTurn(s) || raising(s))) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const a = actor(s);
  if (t.kind !== 'city') return 'No buildings here';
  const pr = s.properties[tile];
  if (pr.owner !== a.id) return 'You do not own this tile';
  if (pr.houses === 0) return 'No buildings to sell';
  if (blockedNow(s, tile)) return 'Sealed by Block';
  if (pr.houses < Math.max(...groupHouses(s, GROUP_TILES[t.group]))) return 'Sell evenly across the group';
  if (pr.houses === 5 && s.houseStock < 4) return 'Not enough houses in stock to replace the hotel';
  return null;
}

/** Shared checks for selling a property or auctioning it: owned, no buildings, not mortgaged, not sealed. */
function transferableCheck(s: GameState, tile: number, owner: Player): string | null {
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  if (!isOwnable(t)) return 'Not a property';
  const pr = s.properties[tile];
  if (pr.owner !== owner.id) return 'You do not own this tile';
  if (pr.houses > 0) return 'Sell the buildings first';
  if (pr.mortgaged) return 'Unmortgage it first';
  if (blockedNow(s, tile)) return 'Sealed by Block';
  return null;
}

export function sellToBankCheck(s: GameState, tile: number): string | null {
  if (!(onTurn(s) || raising(s))) return 'Not now';
  return transferableCheck(s, tile, actor(s));
}

export function auctionOwnCheck(s: GameState, tile: number): string | null {
  if (!onTurn(s)) return 'Not now';
  const p = currentPlayer(s);
  const bad = transferableCheck(s, tile, p);
  if (bad) return bad;
  if (alivePlayers(s).length < 2) return 'No one else to bid';
  return null;
}

export function mortgageCheck(s: GameState, tile: number): string | null {
  if (!(onTurn(s) || raising(s))) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const a = actor(s);
  if (!isOwnable(t)) return 'Not a property';
  const pr = s.properties[tile];
  if (pr.owner !== a.id) return 'You do not own this tile';
  if (pr.mortgaged) return 'Already mortgaged';
  if (blockedNow(s, tile)) return 'Sealed by Block';
  if (t.kind === 'city' && GROUP_TILES[t.group].some((i) => s.properties[i].houses > 0)) return 'Sell buildings in this group first';
  return null;
}

export function unmortgageCheck(s: GameState, tile: number): string | null {
  if (!onTurn(s)) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const p = currentPlayer(s);
  if (!isOwnable(t)) return 'Not a property';
  const pr = s.properties[tile];
  if (pr.owner !== p.id) return 'You do not own this tile';
  if (!pr.mortgaged) return 'Not mortgaged';
  if (p.cash < unmortgageCost(t.price)) return 'Not enough cash';
  return null;
}

export function jokerUseCheck(s: GameState, joker: string, action: Extract<Action, { type: 'USE_JOKER' }>): string | null {
  const p = currentPlayer(s);
  if (!p.jokers.includes(joker)) return 'You do not hold that Joker';
  const kind = jokerKind(joker);
  if (s.phase.t === 'chance') {
    const d = s.phase.debt;
    if (kind !== 'uno') return 'Only Uno Reverse can answer this';
    if (d.debtor !== p.id) return 'Not your charge';
    return null;
  }
  if (!(s.phase.t === 'turnStart' || s.phase.t === 'turnEnd')) return 'Not now';
  if (kind === 'jail') return p.inJail && s.phase.t === 'turnStart' ? null : 'You are not in Jail';
  if (kind === 'heist') {
    if (s.phase.t !== 'turnStart') return 'Heist is used before you roll';
    const target = action.target ? s.players.find((x) => x.id === action.target) : undefined;
    if (!target || target.bankrupt || target.id === p.id) return 'Choose another player';
    return null;
  }
  if (kind === 'block') {
    if (action.tile === undefined || badTile(action.tile)) return 'Choose a property';
    const pr = s.properties[action.tile];
    if (!pr || pr.owner !== p.id) return 'You do not own that property';
    if (BOARD[action.tile].kind === 'market') return 'Not a property';
    if (blockedNow(s, action.tile)) return 'Already sealed';
    return null;
  }
  // uno: reverses a Heist taken from you (your turn start), or flips your Stock Market multiplier
  if (action.mode === 'heist' || (action.mode === undefined && p.heistOwed)) {
    if (s.phase.t !== 'turnStart' || !p.heistOwed) return 'Nothing to reverse';
    return null;
  }
  const m = p.market;
  if (!m || s.round < m.from || s.round > m.until) return 'No Stock Market effect to flip';
  return null;
}

/** Use a held Joker. The holder reveals it, the effect applies, and the card goes back into the Kismat pile. */
function useJoker(s: GameState, p: Player, action: Extract<Action, { type: 'USE_JOKER' }>): void {
  const kind = jokerKind(action.joker);
  p.jokers = p.jokers.filter((x) => x !== action.joker);
  returnHeldCard(s, action.joker);
  p.stats.jokers[kind] += 1;
  const card = cardById(action.joker);
  const e = card.effect as { type: 'joker'; used: string[] };
  const flavor = e.used[Math.floor(rand(s) * e.used.length)];
  log(s, kind === 'heist' ? 'heist' : kind === 'uno' ? 'uno' : kind === 'block' ? 'block' : 'joker', `${p.name} plays a Joker: "${flavor}"`, { player: p.id });

  if (s.phase.t === 'chance') {
    // Uno Reverse on a charge: the payee pays the debtor instead, and the charge is cancelled for the holder.
    const d = s.phase.debt;
    s.debtQueue.shift();
    if (d.payee.kind === 'player') {
      s.debtQueue.unshift({ debtor: d.payee.id, payee: { kind: 'player', id: p.id }, amount: d.amount, reason: `${d.reason}, reversed`, kind: d.kind, offered: true });
    } else {
      p.cash += d.amount; // the charge was owed to the pot or nowhere: the holder collects it from the bank
      log(s, 'uno', `${p.name} reverses the charge: ₹${d.amount} comes back to ${p.name}.`, { player: p.id, amount: d.amount });
    }
    return settle(s);
  }

  if (kind === 'jail') {
    leaveJail(s, p, `${p.name} uses a Joker to leave Jail.`);
    return;
  }
  if (kind === 'heist') {
    const target = playerById(s, action.target as PlayerId);
    const amount = Math.min(CONFIG.heistCap, Math.max(0, target.cash));
    target.cash -= amount;
    p.cash += amount;
    target.heistOwed = { thief: p.id, amount };
    log(s, 'heist', `${p.name} takes ₹${amount} from ${target.name}.`, { player: p.id, amount });
    return;
  }
  if (kind === 'block') {
    const pr = s.properties[action.tile as number];
    pr.blockedUntil = s.turns + CONFIG.blockTurns;
    log(s, 'block', `${BOARD[action.tile as number].name} is sealed by the government for ${CONFIG.blockTurns} turns. No rent.`, { player: p.id, tile: action.tile });
    return;
  }
  // uno, not in a charge
  if (action.mode === 'heist' || (action.mode === undefined && p.heistOwed)) {
    const owed = p.heistOwed as { thief: PlayerId; amount: number };
    p.heistOwed = null;
    s.debtQueue.unshift({ debtor: owed.thief, payee: { kind: 'player', id: p.id }, amount: owed.amount, reason: 'heist reversed', kind: 'card', offered: true });
    s.resumePhase = { t: 'turnStart' };
    return settle(s);
  }
  // flip the Stock Market multiplier: 0.5 becomes 2, 2 becomes 0.5, 1 stays
  const m = p.market as NonNullable<Player['market']>;
  const flipped = m.mult === 0.5 ? 2 : m.mult === 2 ? 0.5 : m.mult;
  p.market = { ...m, mult: flipped };
  log(s, 'market', `${p.name} reverses the Stock Market: ×${m.mult} becomes ×${flipped}.`, { player: p.id });
}

export function tradeCheck(s: GameState, offer: TradeOffer): string | null {
  if (!onTurn(s)) return 'Not now';
  if (s.pendingTrade) return 'A trade is already open';
  if (offer.from !== currentPlayer(s).id) return 'Only the player on turn can propose';
  return offerProblem(s, offer);
}

const mortgageFees = (s: GameState, tiles: number[]): number =>
  tiles.reduce((sum, i) => {
    const t = BOARD[i];
    return sum + (isOwnable(t) && s.properties[i].mortgaged ? tradeFee(t.price) : 0);
  }, 0);

function sideProblem(s: GameState, ownerId: PlayerId, side: TradeSide): string | null {
  const o = playerById(s, ownerId);
  if (!Number.isInteger(side.cash) || side.cash < 0) return 'Bad cash amount';
  if (side.cash > o.cash) return `${o.name} does not have that much cash`;
  if (new Set(side.tiles).size !== side.tiles.length) return 'Duplicate tile';
  for (const i of side.tiles) {
    if (badTile(i) || !isOwnable(BOARD[i])) return 'Bad tile';
    if (s.properties[i].owner !== ownerId) return `${o.name} does not own ${BOARD[i].name}`;
    if (blockedNow(s, i)) return `${BOARD[i].name} is sealed by Block`;
    const t = BOARD[i];
    if (t.kind === 'city' && GROUP_TILES[t.group].some((j) => s.properties[j].houses > 0)) return 'Sell buildings in that color group first';
  }
  const held = [...o.jailFreeCards];
  for (const d of side.jailFree) {
    const k = held.indexOf(d);
    if (k < 0) return `${o.name} does not hold that card`;
    held.splice(k, 1);
  }
  return null;
}

function offerProblem(s: GameState, offer: TradeOffer): string | null {
  const from = s.players.find((p) => p.id === offer.from);
  const to = s.players.find((p) => p.id === offer.to);
  if (!from || !to || from.bankrupt || to.bankrupt || from.id === to.id) return 'Bad trade partners';
  const e = sideProblem(s, from.id, offer.give) ?? sideProblem(s, to.id, offer.get);
  if (e) return e;
  const empty = (x: TradeSide): boolean => x.cash === 0 && x.tiles.length === 0 && x.jailFree.length === 0;
  if (empty(offer.give) && empty(offer.get)) return 'Empty trade';
  if (from.cash - offer.give.cash + offer.get.cash - mortgageFees(s, offer.get.tiles) < 0) return `${from.name} cannot cover the mortgage fee`;
  if (to.cash - offer.get.cash + offer.give.cash - mortgageFees(s, offer.give.tiles) < 0) return `${to.name} cannot cover the mortgage fee`;
  return null;
}

function executeTrade(s: GameState, offer: TradeOffer): void {
  const from = playerById(s, offer.from);
  const to = playerById(s, offer.to);
  const feeFrom = mortgageFees(s, offer.get.tiles);
  const feeTo = mortgageFees(s, offer.give.tiles);
  from.cash += offer.get.cash - offer.give.cash - feeFrom;
  to.cash += offer.give.cash - offer.get.cash - feeTo;
  for (const i of offer.give.tiles) s.properties[i].owner = to.id;
  for (const i of offer.get.tiles) s.properties[i].owner = from.id;
  const move = (src: Player, dst: Player, decks: DeckName[]): void => {
    for (const d of decks) {
      src.jailFreeCards.splice(src.jailFreeCards.indexOf(d), 1);
      dst.jailFreeCards.push(d);
    }
  };
  move(from, to, offer.give.jailFree);
  move(to, from, offer.get.jailFree);
  log(s, 'trade', `${from.name} and ${to.name} complete a trade.`);
}

/** Every action the acting player may take on properties right now. */
export function managerActions(s: GameState): Action[] {
  const out: Action[] = [];
  for (let i = 0; i < N; i++) {
    if (!isOwnable(BOARD[i])) continue;
    if (buildCheck(s, i) === null) out.push({ type: 'BUILD', tile: i });
    if (sellCheck(s, i) === null) out.push({ type: 'SELL_BUILDING', tile: i });
    if (sellToBankCheck(s, i) === null) out.push({ type: 'SELL_TO_BANK', tile: i });
    if (auctionOwnCheck(s, i) === null) out.push({ type: 'AUCTION_OWN', tile: i });
    if (mortgageCheck(s, i) === null) out.push({ type: 'MORTGAGE', tile: i });
    if (unmortgageCheck(s, i) === null) out.push({ type: 'UNMORTGAGE', tile: i });
  }
  return out;
}

// ---------------------------------------------------------------- reducer
function apply(s: GameState, action: Action): boolean {
  const p = currentPlayer(s);
  const ph = s.phase;
  // While a trade is open, only accept or decline.
  if (s.pendingTrade && action.type !== 'TRADE_ACCEPT' && action.type !== 'TRADE_DECLINE') return false;
  switch (action.type) {
    case 'ROLL':
      return doRoll(s);

    case 'JAIL_PAY':
      if (ph.t !== 'turnStart' || !p.inJail || p.cash < CONFIG.jailFine) return false;
      p.cash -= CONFIG.jailFine;
      leaveJail(s, p, `${p.name} pays ₹${CONFIG.jailFine} and leaves Jail.`);
      return true;

    case 'JAIL_USE_CARD': {
      if (ph.t !== 'turnStart' || !p.inJail || p.jailFreeCards.length === 0) return false;
      const deck = p.jailFreeCards.shift() as DeckName;
      returnJailCard(s, deck);
      leaveJail(s, p, `${p.name} uses a Get out of Jail free card.`);
      return true;
    }

    case 'USE_JOKER': {
      if (jokerUseCheck(s, action.joker, action) !== null) return false;
      useJoker(s, p, action);
      return true;
    }

    case 'BUY': {
      if (ph.t !== 'buyOrAuction') return false;
      const t = BOARD[ph.tile];
      if (!isOwnable(t) || p.cash < t.price) return false;
      p.cash -= t.price;
      s.properties[ph.tile].owner = p.id;
      log(s, 'buy', `${p.name} buys ${t.name} for ₹${t.price}.`, { player: p.id, tile: ph.tile, amount: t.price });
      settle(s);
      return true;
    }

    case 'DECLINE_BUY':
      if (ph.t !== 'buyOrAuction') return false;
      startAuction(s, ph.tile, `${p.name} declines ${BOARD[ph.tile].name}. Auction starts.`);
      return true;

    case 'AUCTION_OWN': {
      if (auctionOwnCheck(s, action.tile) !== null) return false;
      const resume = { ...s.phase } as Phase;
      s.resumePhase = resume;
      startAuction(s, action.tile, `${p.name} puts ${BOARD[action.tile].name} up for auction.`, p.id);
      return true;
    }

    case 'AUCTION_BID': {
      if (ph.t !== 'auction') return false;
      const a = ph.auction;
      const bidder = s.players.find((x) => x.id === action.player);
      if (!bidder || action.player !== a.toAct) return false;
      if (!Number.isInteger(action.amount) || action.amount < minBid(a.highBid) || action.amount > bidder.cash) return false;
      a.highBid = action.amount;
      a.highBidder = bidder.id;
      a.toAct = a.inAuction[(a.inAuction.indexOf(bidder.id) + 1) % a.inAuction.length];
      log(s, 'auction', `${bidder.name} bids ₹${action.amount}.`, { player: bidder.id, amount: action.amount });
      checkAuctionEnd(s);
      return true;
    }

    case 'AUCTION_PASS': {
      if (ph.t !== 'auction') return false;
      const a = ph.auction;
      if (action.player !== a.toAct) return false;
      const idx = a.inAuction.indexOf(action.player);
      a.inAuction.splice(idx, 1);
      if (a.inAuction.length > 0) a.toAct = a.inAuction[idx % a.inAuction.length];
      log(s, 'auction', `${playerById(s, action.player).name} passes.`, { player: action.player });
      checkAuctionEnd(s);
      return true;
    }

    case 'ACK_CARD': {
      if (ph.t !== 'cardShown') return false;
      applyCard(s, p, cardById(ph.cardId), ph.roll);
      return true;
    }

    case 'PAY_DEBT': {
      if (ph.t !== 'debt' && ph.t !== 'chance') return false;
      const d = ph.debt;
      if (playerById(s, d.debtor).cash < d.amount) return false;
      s.debtQueue.shift();
      transfer(s, d);
      settle(s);
      return true;
    }

    case 'DECLARE_BANKRUPTCY': {
      if (ph.t !== 'debt' && ph.t !== 'chance') return false;
      const d = ph.debt;
      bankrupt(s, d.debtor, d.payee);
      s.debtQueue = s.debtQueue.filter((x) => x.debtor !== d.debtor);
      if (d.debtor === p.id) {
        s.pendingMove = null;
        s.pendingBuy = null;
        s.resumePhase = null;
      }
      if (s.phase.t === 'gameOver') return true;
      afterAuction(s);
      return true;
    }

    case 'SELL_TO_BANK': {
      if (sellToBankCheck(s, action.tile) !== null) return false;
      const t = BOARD[action.tile];
      if (!isOwnable(t)) return false;
      const a = actor(s);
      const pr = s.properties[action.tile];
      const price = bankPrice(t.price);
      a.cash += price;
      pr.owner = null;
      log(s, 'sell', `${a.name} sells ${t.name} back to the bank for ₹${price}.`, { player: a.id, tile: action.tile, amount: price });
      return true;
    }

    case 'BUILD': {
      if (buildCheck(s, action.tile) !== null) return false;
      const t = BOARD[action.tile];
      if (t.kind !== 'city') return false;
      const pr = s.properties[action.tile];
      p.cash -= t.houseCost;
      if (pr.houses === 4) {
        s.hotelStock -= 1;
        s.houseStock += 4;
        pr.houses = 5;
      } else {
        s.houseStock -= 1;
        pr.houses += 1;
      }
      log(s, 'build', `${p.name} builds ${pr.houses === 5 ? 'a hotel' : 'a house'} on ${t.name} for ₹${t.houseCost}.`, { player: p.id, tile: action.tile, amount: t.houseCost });
      return true;
    }

    case 'SELL_BUILDING': {
      if (sellCheck(s, action.tile) !== null) return false;
      const t = BOARD[action.tile];
      if (t.kind !== 'city') return false;
      const a = actor(s);
      const pr = s.properties[action.tile];
      const refund = sellValue(t.houseCost);
      a.cash += refund;
      if (pr.houses === 5) {
        s.hotelStock += 1;
        s.houseStock -= 4;
        pr.houses = 4;
      } else {
        s.houseStock += 1;
        pr.houses -= 1;
      }
      log(s, 'sell', `${a.name} sells a building on ${t.name} for ₹${refund}.`, { player: a.id, tile: action.tile, amount: refund });
      return true;
    }

    case 'MORTGAGE': {
      if (mortgageCheck(s, action.tile) !== null) return false;
      const t = BOARD[action.tile];
      if (!isOwnable(t)) return false;
      const a = actor(s);
      a.cash += mortgageValue(t.price);
      s.properties[action.tile].mortgaged = true;
      log(s, 'mortgage', `${a.name} mortgages ${t.name} for ₹${mortgageValue(t.price)}.`, { player: a.id, tile: action.tile, amount: mortgageValue(t.price) });
      return true;
    }

    case 'UNMORTGAGE': {
      if (unmortgageCheck(s, action.tile) !== null) return false;
      const t = BOARD[action.tile];
      if (!isOwnable(t)) return false;
      const cost = unmortgageCost(t.price);
      p.cash -= cost;
      s.properties[action.tile].mortgaged = false;
      log(s, 'mortgage', `${p.name} unmortgages ${t.name} for ₹${cost}.`, { player: p.id, tile: action.tile, amount: cost });
      return true;
    }

    case 'TRADE_PROPOSE':
      if (tradeCheck(s, action.offer) !== null) return false;
      s.pendingTrade = structuredClone(action.offer);
      log(s, 'trade', `${playerById(s, action.offer.from).name} offers ${playerById(s, action.offer.to).name} a trade.`);
      return true;

    case 'TRADE_ACCEPT': {
      if (!s.pendingTrade || offerProblem(s, s.pendingTrade) !== null) return false;
      executeTrade(s, s.pendingTrade);
      s.pendingTrade = null;
      return true;
    }

    case 'TRADE_DECLINE':
      if (!s.pendingTrade) return false;
      log(s, 'trade', `${playerById(s, s.pendingTrade.to).name} declines the trade.`);
      s.pendingTrade = null;
      return true;

    case 'VOTE_END': {
      const voter = s.players.find((x) => x.id === action.player);
      if (!voter || voter.bankrupt || s.phase.t === 'gameOver') return false;
      s.endVotes = s.endVotes.includes(voter.id) ? s.endVotes.filter((x) => x !== voter.id) : [...s.endVotes, voter.id];
      const alive = alivePlayers(s).length;
      const was = s.endPending;
      s.endPending = s.endVotes.length * 2 > alive; // a strict majority
      if (s.endPending && !was) log(s, 'vote', 'A majority wants to end the game. It ends after this turn.');
      if (!s.endPending && was) log(s, 'vote', 'The vote to end the game was withdrawn.');
      return true;
    }

    case 'END_TURN':
      if (ph.t !== 'turnEnd' || ph.rollAgain) return false;
      p.doublesInRow = 0;
      s.turns += 1;
      if (s.endPending) {
        endByNetWorth(s);
        return true;
      }
      advanceTurn(s);
      return true;

    case 'START_GAME':
      return false;
  }
}

/** Returns a new state, or the SAME object when the action is illegal right now. */
export function reduce(state: GameState, action: Action): GameState {
  if (action.type === 'START_GAME') return startGame(action.players, action.win, action.seed);
  const s = structuredClone(state);
  return apply(s, action) ? s : state;
}

/** Sensible legal actions for the current phase. Bids list the minimum bid only. */
export function legalActions(s: GameState): Action[] {
  const p = currentPlayer(s);
  const ph = s.phase;
  if (s.pendingTrade) return [{ type: 'TRADE_ACCEPT' }, { type: 'TRADE_DECLINE' }];
  switch (ph.t) {
    case 'turnStart': {
      const out: Action[] = [{ type: 'ROLL' }];
      if (p.inJail && p.cash >= CONFIG.jailFine) out.push({ type: 'JAIL_PAY' });
      if (p.inJail && p.jailFreeCards.length > 0) out.push({ type: 'JAIL_USE_CARD' });
      return out;
    }
    case 'buyOrAuction': {
      const t = BOARD[ph.tile];
      const out: Action[] = [{ type: 'DECLINE_BUY' }];
      if (isOwnable(t) && p.cash >= t.price) out.unshift({ type: 'BUY' });
      return out;
    }
    case 'auction': {
      const a = ph.auction;
      const b = playerById(s, a.toAct);
      const min = minBid(a.highBid);
      const out: Action[] = [{ type: 'AUCTION_PASS', player: a.toAct }];
      if (b.cash >= min) out.unshift({ type: 'AUCTION_BID', player: a.toAct, amount: min });
      return out;
    }
    case 'cardShown':
      return [{ type: 'ACK_CARD' }];
    case 'debt': {
      const out: Action[] = [{ type: 'DECLARE_BANKRUPTCY' }];
      if (playerById(s, ph.debt.debtor).cash >= ph.debt.amount) out.unshift({ type: 'PAY_DEBT' });
      return out;
    }
    case 'chance': {
      const out: Action[] = [{ type: 'DECLARE_BANKRUPTCY' }];
      const joker = p.jokers.find((id) => jokerKind(id) === 'uno');
      if (joker) out.unshift({ type: 'USE_JOKER', joker });
      if (p.cash >= ph.debt.amount) out.unshift({ type: 'PAY_DEBT' });
      return out;
    }
    case 'turnEnd':
      return [ph.rollAgain ? { type: 'ROLL' } : { type: 'END_TURN' }];
    case 'gameOver':
      return [];
  }
}
