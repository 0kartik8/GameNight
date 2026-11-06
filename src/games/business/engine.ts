import { BOARD, GROUP_TILES, HOLY_TILES, RAIL_TILES, UTILITY_TILES, POS, isOwnable, mortgageValue } from './board';
import type { DeckName } from './board';
import { cardById, cardsOf } from './cards';
import type { Card } from './cards';
import { CONFIG } from './config';
import type { Action, EventKind, GameState, Payee, Player, PlayerId, PropertyState, TradeOffer, TradeSide, WinCondition } from './types';

// Pure engine. No React. State is plain JSON. reduce(state, action) never mutates its input.
// Implemented: start, roll, move, buy, auction, rent, tax, Free Parking pot, jail, cards,
// debt, bankruptcy (with asset auctions), build, sell, mortgage, trade, win checks.
// The *Check functions return null when allowed, else a short reason. The UI uses them to disable buttons.

const N = BOARD.length;
const DECK_LABEL: Record<DeckName, string> = { kismat: 'Kismat', khazana: 'Khazana' };

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

export function rentFor(s: GameState, tile: number, dice: number): number {
  const t = BOARD[tile];
  const pr = s.properties[tile];
  if (!pr || pr.owner === null || pr.mortgaged) return 0;
  const owner = pr.owner;
  const count = (idxs: number[]): number => idxs.filter((i) => s.properties[i].owner === owner).length;
  switch (t.kind) {
    case 'city': {
      if (pr.houses > 0) return t.rent[pr.houses];
      const full = GROUP_TILES[t.group].every((i) => s.properties[i].owner === owner);
      return full ? t.rent[0] * 2 : t.rent[0];
    }
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
    if (t.kind === 'city') w += pr.houses * t.houseCost; // hotel = 5
  }
  return w;
}

// ---------------------------------------------------------------- log
function log(s: GameState, kind: EventKind, text: string, extra: { player?: PlayerId; tile?: number; amount?: number } = {}): void {
  const seq = s.log.length ? s.log[s.log.length - 1].seq + 1 : 1;
  s.log.push({ seq, kind, text, ...extra });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

// ---------------------------------------------------------------- start
export function startGame(entries: { name: string; token: string }[], win: WinCondition, seed: number): GameState {
  if (entries.length < CONFIG.players.min || entries.length > CONFIG.players.max) {
    throw new Error(`Players must be ${CONFIG.players.min}-${CONFIG.players.max}`);
  }
  const properties: Record<number, PropertyState> = {};
  BOARD.forEach((t, i) => {
    if (isOwnable(t)) properties[i] = { owner: null, mortgaged: false, houses: 0, donations: 0 };
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
    })),
    current: 0,
    round: 1,
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

// ---------------------------------------------------------------- holy and corrupted cities
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
 * owned properties. If that is still a tie, the money goes into the Free Parking pot.
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

function transfer(s: GameState, d: GameState['debtQueue'][number]): void {
  const from = playerById(s, d.debtor);
  from.cash -= d.amount;
  let to = 'the bank';
  if (d.payee.kind === 'player') {
    const c = playerById(s, d.payee.id);
    c.cash += d.amount;
    to = c.name;
  } else if (d.payee.kind === 'pot') {
    s.pot += d.amount;
    to = 'the Free Parking pot';
  }
  log(s, d.kind, `${from.name} pays ₹${d.amount} to ${to} (${d.reason}).`, { player: from.id, amount: d.amount });
  if (d.holyTile !== undefined) {
    // Only a paid donation counts toward corruption.
    const pr = s.properties[d.holyTile];
    pr.donations += 1;
    if (pr.donations >= CONFIG.holy.corruptAfter) log(s, 'corrupt', `${BOARD[d.holyTile].name} is now corrupted!`, { tile: d.holyTile });
  }
}

// Pay queued debts in order. Stops at the first one the debtor cannot cover.
// When the queue is empty, finishes the resolution of the current landing.
function settle(s: GameState): void {
  while (s.debtQueue.length > 0) {
    const d = s.debtQueue[0];
    const debtor = playerById(s, d.debtor);
    if (debtor.bankrupt) {
      s.debtQueue.shift();
      continue;
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
        log(s, 'pot', `${p.name} collects ₹${s.pot} from Free Parking.`, { player: p.id, amount: s.pot });
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
    case 'city':
    case 'holy':
    case 'rail':
    case 'utility':
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
    const rent = rentFor(s, i, diceTotal(s)); // 0 when the tile is mortgaged
    // A corrupted city adds a bribe for its owner. No rent, no bribe.
    const bribe = t.kind === 'holy' && !donates && rent > 0 ? bribeNow(s) : 0;
    owe(s, p.id, { kind: 'player', id: pr.owner }, rent + bribe, bribe > 0 ? `rent and bribe for ${t.name}` : `rent for ${t.name}`, 'rent');
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
  if (card.effect.type !== 'jailFree') pile.push(id); // jail-free is held until used
  s.phase = { t: 'cardShown', cardId: id };
  log(s, 'card', `${p.name} draws ${DECK_LABEL[deck]}: "${card.line}"`, { player: p.id });
}

function returnJailCard(s: GameState, deck: DeckName): void {
  const c = cardsOf(deck).find((x) => x.effect.type === 'jailFree');
  if (c) s.decks[deck].drawPile.push(c.id);
}

function applyCard(s: GameState, p: Player, card: Card): void {
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
    case 'moveTo':
      return relocate(s, p, e.tile, e.tile < p.position);
    case 'moveBy': {
      const raw = p.position + e.steps;
      return relocate(s, p, ((raw % N) + N) % N, e.steps > 0 && raw >= N);
    }
    case 'goToJail':
      return sendToJail(s, p);
    case 'jailFree':
      p.jailFreeCards.push(card.deck);
      log(s, 'card', `${p.name} keeps a Get out of Jail free card.`, { player: p.id });
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

// ---------------------------------------------------------------- auction
function startAuction(s: GameState, tile: number, why: string): void {
  const order: PlayerId[] = [];
  for (let k = 1; k <= s.players.length; k++) {
    const q = s.players[(s.current + k) % s.players.length];
    if (!q.bankrupt) order.push(q.id);
  }
  s.phase = { t: 'auction', auction: { tile, highBid: 0, highBidder: null, inAuction: order, toAct: order[0] } };
  log(s, 'auction', why, { tile });
}

// After any auction: run the next bankruptcy auction if one is waiting, else carry on.
function afterAuction(s: GameState): void {
  const next = s.pendingAuctions.shift();
  if (next !== undefined) {
    startAuction(s, next, `${BOARD[next].name} is auctioned from the bankruptcy.`);
    return;
  }
  settle(s);
}

const minBid = (highBid: number): number => (highBid === 0 ? CONFIG.auction.openingBid : highBid + CONFIG.auction.raiseButtons[0]);

function checkAuctionEnd(s: GameState): void {
  if (s.phase.t !== 'auction') return;
  const a = s.phase.auction;
  const t = BOARD[a.tile];
  if (a.inAuction.length === 0) {
    log(s, 'auction', `No bids. ${t.name} stays unowned.`, { tile: a.tile });
    afterAuction(s);
    return;
  }
  if (a.inAuction.length === 1 && a.highBidder === a.inAuction[0]) {
    const w = playerById(s, a.highBidder);
    w.cash -= a.highBid;
    s.properties[a.tile].owner = w.id;
    log(s, 'auction', `${w.name} wins ${t.name} for ₹${a.highBid}.`, { player: w.id, tile: a.tile, amount: a.highBid });
    afterAuction(s);
  }
}

// ---------------------------------------------------------------- bankruptcy and turns
function bankrupt(s: GameState, id: PlayerId, payee: Payee): void {
  const p = playerById(s, id);
  const tiles = ownedTiles(s, id);
  log(s, 'bankrupt', `${p.name} is bankrupt.`, { player: id });
  p.cash += liquidateBuildings(s, id); // buildings go back to the bank at half cost
  if (payee.kind === 'player') {
    const c = playerById(s, payee.id);
    c.cash += p.cash;
    for (const i of tiles) s.properties[i].owner = c.id;
    c.jailFreeCards.push(...p.jailFreeCards);
  } else {
    // Assets return to the bank clean (unmortgaged) and are auctioned one by one.
    for (const i of tiles) s.properties[i] = { owner: null, mortgaged: false, houses: 0, donations: s.properties[i].donations };
    s.pendingAuctions = [...tiles];
    for (const d of p.jailFreeCards) returnJailCard(s, d);
  }
  p.cash = 0;
  p.jailFreeCards = [];
  p.bankrupt = true;
  p.inJail = false;
  p.speedLimit = false;
  p.doublesInRow = 0;
  const alive = alivePlayers(s);
  if (alive.length === 1) {
    s.pendingAuctions = [];
    s.phase = { t: 'gameOver', winner: alive[0].id, reason: 'lastStanding' };
    log(s, 'win', `${alive[0].name} wins as last player standing.`, { player: alive[0].id });
  }
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

// ---------------------------------------------------------------- buildings, mortgage, trade
const ceilFee = (rate: number, base: number): number => Math.ceil(base * rate - 1e-9);
export const unmortgageCost = (price: number): number => {
  const mv = mortgageValue(price);
  return mv + ceilFee(CONFIG.unmortgageInterest, mv);
};
export const tradeFee = (price: number): number => ceilFee(CONFIG.tradeMortgagedFee, mortgageValue(price));
const sellValue = (houseCost: number): number => Math.floor(houseCost * CONFIG.buildingSellRate);
const onTurn = (s: GameState): boolean => s.phase.t === 'turnStart' || s.phase.t === 'turnEnd';
const badTile = (tile: number): boolean => !Number.isInteger(tile) || tile < 0 || tile >= N;
const groupHouses = (s: GameState, group: number[]): number[] => group.map((i) => s.properties[i].houses);

// Who acts on manager actions: the debtor while raising cash, else the player on turn.
function actor(s: GameState): Player {
  return s.phase.t === 'debt' ? playerById(s, s.phase.debt.debtor) : currentPlayer(s);
}

export function buildCheck(s: GameState, tile: number): string | null {
  if (!onTurn(s)) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const p = currentPlayer(s);
  if (t.kind !== 'city') return 'Only cities take buildings';
  const pr = s.properties[tile];
  if (pr.owner !== p.id) return 'You do not own this tile';
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
  if (!(onTurn(s) || s.phase.t === 'debt')) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const a = actor(s);
  if (t.kind !== 'city') return 'No buildings here';
  const pr = s.properties[tile];
  if (pr.owner !== a.id) return 'You do not own this tile';
  if (pr.houses === 0) return 'No buildings to sell';
  if (pr.houses < Math.max(...groupHouses(s, GROUP_TILES[t.group]))) return 'Sell evenly across the group';
  if (pr.houses === 5 && s.houseStock < 4) return 'Not enough houses in stock to replace the hotel';
  return null;
}

export function mortgageCheck(s: GameState, tile: number): string | null {
  if (!(onTurn(s) || s.phase.t === 'debt')) return 'Not now';
  if (badTile(tile)) return 'No such tile';
  const t = BOARD[tile];
  const a = actor(s);
  if (!isOwnable(t)) return 'Not a property';
  const pr = s.properties[tile];
  if (pr.owner !== a.id) return 'You do not own this tile';
  if (pr.mortgaged) return 'Already mortgaged';
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

// Buildings go back to the bank at half cost. Returns the cash.
function liquidateBuildings(s: GameState, id: PlayerId): number {
  let cash = 0;
  for (const i of ownedTiles(s, id)) {
    const t = BOARD[i];
    const pr = s.properties[i];
    if (t.kind !== 'city' || pr.houses === 0) continue;
    cash += pr.houses * sellValue(t.houseCost);
    if (pr.houses === 5) s.hotelStock += 1;
    else s.houseStock += pr.houses;
    pr.houses = 0;
  }
  return cash;
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

export function tradeCheck(s: GameState, offer: TradeOffer): string | null {
  if (!onTurn(s)) return 'Not now';
  if (s.pendingTrade) return 'A trade is already open';
  if (offer.from !== currentPlayer(s).id) return 'Only the player on turn can propose';
  return offerProblem(s, offer);
}

function executeTrade(s: GameState, offer: TradeOffer): void {
  const from = playerById(s, offer.from);
  const to = playerById(s, offer.to);
  const feeFrom = mortgageFees(s, offer.get.tiles); // from receives these tiles
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

/** Every build, sell, mortgage, unmortgage the acting player may do right now. */
export function managerActions(s: GameState): Action[] {
  const out: Action[] = [];
  for (let i = 0; i < N; i++) {
    if (!isOwnable(BOARD[i])) continue;
    if (buildCheck(s, i) === null) out.push({ type: 'BUILD', tile: i });
    if (sellCheck(s, i) === null) out.push({ type: 'SELL_BUILDING', tile: i });
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

    case 'ACK_CARD':
      if (ph.t !== 'cardShown') return false;
      applyCard(s, p, cardById(ph.cardId));
      return true;

    case 'PAY_DEBT': {
      if (ph.t !== 'debt') return false;
      const d = ph.debt;
      if (playerById(s, d.debtor).cash < d.amount) return false;
      s.debtQueue.shift();
      transfer(s, d);
      settle(s);
      return true;
    }

    case 'DECLARE_BANKRUPTCY': {
      if (ph.t !== 'debt') return false;
      const d = ph.debt;
      bankrupt(s, d.debtor, d.payee);
      s.debtQueue = s.debtQueue.filter((x) => x.debtor !== d.debtor);
      if (d.debtor === p.id) {
        s.pendingMove = null;
        s.pendingBuy = null;
      }
      if (s.phase.t === 'gameOver') return true;
      afterAuction(s);
      return true;
    }

    case 'END_TURN':
      if (ph.t !== 'turnEnd' || ph.rollAgain) return false;
      p.doublesInRow = 0;
      advanceTurn(s);
      return true;

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
    case 'turnEnd':
      return [ph.rollAgain ? { type: 'ROLL' } : { type: 'END_TURN' }];
    case 'gameOver':
      return [];
  }
}
