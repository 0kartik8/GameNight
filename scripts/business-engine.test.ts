import { strict as assert } from 'node:assert';
import { BOARD, GROUP_TILES, indexOfTile } from '../src/games/business/board';
import { cardById, cardsOf } from '../src/games/business/cards';
import { CONFIG } from '../src/games/business/config';
import { currentPlayer, legalActions, managerActions, netWorth, ownedTiles, reduce, rentFor, startGame, tradeCheck, unmortgageCost } from '../src/games/business/engine';
import type { Action, GameState, Player, TradeOffer, TradeSide, WinCondition } from '../src/games/business/types';

let passed = 0;
const failed: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}\n      ${(e as Error).message.split('\n')[0]}`);
  }
}

// ---------------------------------------------------------------- helpers
const mk = (n = 4, win: WinCondition = { mode: 'lastStanding' }, seed = 7): GameState =>
  startGame(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, token: 'x' })), win, seed);
const P = (s: GameState, name: string): Player => {
  const p = s.players.find((x) => x.name === name);
  if (!p) throw new Error(`no ${name}`);
  return p;
};
function setup(s: GameState, name: string, pos: number): GameState {
  s.current = s.players.findIndex((p) => p.name === name);
  s.players[s.current].position = pos;
  s.phase = { t: 'turnStart' };
  return s;
}
function act(s: GameState, a: Action): GameState {
  const r = reduce(s, a);
  assert.notEqual(r, s, `action rejected: ${a.type}`);
  return r;
}
const rejected = (s: GameState, a: Action): void => assert.equal(reduce(s, a), s, `expected reject: ${a.type}`);
function withRoll(s: GameState, a: number, b: number): GameState {
  for (let k = 0; k < 200000; k++) {
    const t = structuredClone(s);
    t.rngState = k;
    const r = reduce(t, { type: 'ROLL' });
    if (r !== t && r.lastRoll && r.lastRoll[0] === a && r.lastRoll[1] === b) {
      const u = structuredClone(s);
      u.rngState = k;
      return u;
    }
  }
  throw new Error(`no rng state for ${a},${b}`);
}
const roll = (s: GameState, a: number, b: number): GameState => act(withRoll(s, a, b), { type: 'ROLL' });
function showCard(s: GameState, name: string, pos: number, cardId: string): GameState {
  setup(s, name, pos);
  s.phase = { t: 'cardShown', cardId };
  return s;
}
const tile = (name: string): number => indexOfTile(name);
const rentOf = (name: string): number[] => (BOARD[tile(name)] as { rent: number[] }).rent;

// ---------------------------------------------------------------- scenarios
test('start: 4 players, 5000 each, decks of 16 unique cards', () => {
  const s = mk();
  assert.equal(s.players.length, 4);
  assert.ok(s.players.every((p) => p.cash === CONFIG.startCash && p.position === 0));
  for (const d of ['kismat', 'khazana'] as const) {
    assert.equal(s.decks[d].drawPile.length, 16);
    assert.equal(new Set(s.decks[d].drawPile).size, 16);
  }
  assert.deepEqual(s.phase, { t: 'turnStart' });
  assert.equal(s.round, 1);
});

test('start rejects 2 and 7 players', () => {
  assert.throws(() => mk(2));
  assert.throws(() => mk(7));
});

test('passing Start pays salary', () => {
  const r = roll(setup(mk(), 'P1', 38), 2, 3);
  assert.equal(P(r, 'P1').position, 3);
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + CONFIG.salary);
  assert.deepEqual(r.phase, { t: 'buyOrAuction', tile: 3 });
});

test('buy: deducts price, sets owner, net worth unchanged', () => {
  let s = roll(setup(mk(), 'P1', 38), 2, 3);
  const id = P(s, 'P1').id;
  const before = netWorth(s, id);
  s = act(s, { type: 'BUY' });
  assert.equal(P(s, 'P1').cash, CONFIG.startCash + CONFIG.salary - 600);
  assert.equal(s.properties[3].owner, id);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });
  assert.equal(netWorth(s, id), before);
});

test('buy rejected when cash is short', () => {
  const s = roll(setup(mk(), 'P1', 38), 2, 3);
  P(s, 'P1').cash = 100;
  rejected(s, { type: 'BUY' });
});

test('auction: highest bidder wins and pays', () => {
  let s = act(roll(setup(mk(), 'P1', 38), 2, 3), { type: 'DECLINE_BUY' });
  assert.equal(s.phase.t, 'auction');
  if (s.phase.t !== 'auction') return;
  const o = [...s.phase.auction.inAuction];
  assert.equal(o[3], P(s, 'P1').id);
  assert.equal(s.phase.auction.toAct, o[0]);
  rejected(s, { type: 'AUCTION_BID', player: o[1], amount: 50 }); // not their turn
  rejected(s, { type: 'AUCTION_BID', player: o[0], amount: 5 }); // below opening bid
  rejected(s, { type: 'AUCTION_BID', player: o[0], amount: 999999 }); // more than cash
  s = act(s, { type: 'AUCTION_BID', player: o[0], amount: 100 });
  s = act(s, { type: 'AUCTION_PASS', player: o[1] });
  s = act(s, { type: 'AUCTION_BID', player: o[2], amount: 150 });
  s = act(s, { type: 'AUCTION_PASS', player: o[3] });
  s = act(s, { type: 'AUCTION_PASS', player: o[0] });
  assert.equal(s.properties[3].owner, o[2]);
  assert.equal(s.players.find((p) => p.id === o[2])!.cash, CONFIG.startCash - 150);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });
});

test('auction: raise must beat high bid by at least the smallest raise', () => {
  let s = act(roll(setup(mk(), 'P1', 38), 2, 3), { type: 'DECLINE_BUY' });
  if (s.phase.t !== 'auction') throw new Error('no auction');
  const o = s.phase.auction.inAuction;
  s = act(s, { type: 'AUCTION_BID', player: o[0], amount: 100 });
  rejected(s, { type: 'AUCTION_BID', player: o[1], amount: 100 });
  rejected(s, { type: 'AUCTION_BID', player: o[1], amount: 105 });
  act(s, { type: 'AUCTION_BID', player: o[1], amount: 110 });
});

test('auction: everyone passes, tile stays unowned', () => {
  let s = act(roll(setup(mk(), 'P1', 38), 2, 3), { type: 'DECLINE_BUY' });
  if (s.phase.t !== 'auction') throw new Error('no auction');
  for (const id of [...s.phase.auction.inAuction]) s = act(s, { type: 'AUCTION_PASS', player: id });
  assert.equal(s.properties[3].owner, null);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });
});

test('city rent: base, then double with full unimproved group', () => {
  const [a, b, c] = [tile('Dehradun'), tile('Shimla'), tile('Amritsar')];
  const base = rentOf('Dehradun')[0];
  let s = setup(mk(), 'P1', 1);
  s.properties[a].owner = P(s, 'P2').id;
  let r = roll(s, 2, 3); // 1 + 5 = 6
  assert.equal(P(r, 'P1').cash, 5000 - base);
  assert.equal(P(r, 'P2').cash, 5000 + base);
  s = setup(mk(), 'P1', 1);
  for (const i of [a, b, c]) s.properties[i].owner = P(s, 'P2').id;
  r = roll(s, 2, 3);
  assert.equal(P(r, 'P1').cash, 5000 - 2 * base);
});

test('mortgaged tile collects no rent', () => {
  const s = setup(mk(), 'P1', 1);
  s.properties[tile('Dehradun')].owner = P(s, 'P2').id;
  s.properties[tile('Dehradun')].mortgaged = true;
  const r = roll(s, 2, 3);
  assert.equal(P(r, 'P1').cash, 5000);
  assert.equal(P(r, 'P2').cash, 5000);
});

test('holy rent scales with count and Aashirwad pays after rent', () => {
  const both = setup(mk(), 'P1', 38);
  both.properties[1].owner = P(both, 'P2').id;
  both.properties[3].owner = P(both, 'P2').id;
  let r = roll(both, 1, 2); // 38 + 3 = 41 -> tile 1, passes Start
  assert.equal(P(r, 'P1').cash, 5000 + CONFIG.salary - 300 + CONFIG.holyBonus);
  assert.equal(P(r, 'P2').cash, 5000 + 300);
  const one = setup(mk(), 'P1', 38);
  one.properties[1].owner = P(one, 'P2').id;
  r = roll(one, 1, 2);
  assert.equal(P(r, 'P1').cash, 5000 + CONFIG.salary - 100 + CONFIG.holyBonus);
  const mort = setup(mk(), 'P1', 38);
  mort.properties[1].owner = P(mort, 'P2').id;
  mort.properties[1].mortgaged = true;
  r = roll(mort, 1, 2);
  assert.equal(P(r, 'P1').cash, 5000 + CONFIG.salary); // no rent, no blessing
});

test('no Aashirwad on your own holy tile', () => {
  const s = setup(mk(), 'P1', 38);
  s.properties[1].owner = P(s, 'P1').id;
  const r = roll(s, 1, 2);
  assert.equal(P(r, 'P1').cash, 5000 + CONFIG.salary);
});

test('rail rent scales with stations owned', () => {
  const s = setup(mk(), 'P1', 0);
  s.properties[5].owner = P(s, 'P2').id;
  s.properties[15].owner = P(s, 'P2').id;
  const r = roll(s, 2, 3);
  assert.equal(P(r, 'P1').cash, 5000 - 165);
});

test('utility rent = dice total x multiplier', () => {
  const one = setup(mk(), 'P1', 5);
  one.properties[12].owner = P(one, 'P2').id;
  let r = roll(one, 3, 4);
  assert.equal(P(r, 'P1').cash, 5000 - 7 * CONFIG.utilityMultiplier.one);
  const two = setup(mk(), 'P1', 5);
  two.properties[12].owner = P(two, 'P2').id;
  two.properties[28].owner = P(two, 'P2').id;
  r = roll(two, 3, 4);
  assert.equal(P(r, 'P1').cash, 5000 - 7 * CONFIG.utilityMultiplier.both);
});

test('tax goes to pot, Free Parking pays the pot out', () => {
  let s = roll(setup(mk(), 'P1', 0), 1, 3); // tile 4 Income Tax
  assert.equal(s.pot, CONFIG.incomeTax);
  assert.equal(P(s, 'P1').cash, 5000 - CONFIG.incomeTax);
  setup(s, 'P2', 14);
  s = roll(s, 2, 4); // tile 20
  assert.equal(P(s, 'P2').cash, 5000 + CONFIG.incomeTax);
  assert.equal(s.pot, 0);
});

test('Go to Jail tile: jail, no salary, turn ends', () => {
  const r = roll(setup(mk(), 'P1', 24), 2, 4);
  assert.equal(P(r, 'P1').position, 10);
  assert.ok(P(r, 'P1').inJail);
  assert.equal(P(r, 'P1').cash, 5000);
  assert.deepEqual(r.phase, { t: 'turnEnd', rollAgain: false });
});

test('three doubles in a row: jail without moving', () => {
  const s = setup(mk(), 'P1', 0);
  P(s, 'P1').doublesInRow = 2;
  const r = roll(s, 3, 3);
  assert.ok(P(r, 'P1').inJail);
  assert.equal(P(r, 'P1').position, 10);
  assert.deepEqual(r.phase, { t: 'turnEnd', rollAgain: false });
});

test('doubles give another roll; END_TURN blocked until then', () => {
  const r = roll(setup(mk(), 'P1', 0), 2, 2); // tile 4 tax
  assert.deepEqual(r.phase, { t: 'turnEnd', rollAgain: true });
  rejected(r, { type: 'END_TURN' });
  const r2 = act(r, { type: 'ROLL' });
  assert.ok(r2.lastRoll);
});

test('jail: pay fine, use card, doubles escape, failed roll, third failure', () => {
  const base = (): GameState => {
    const s = setup(mk(), 'P1', 10);
    P(s, 'P1').inJail = true;
    return s;
  };
  let s = act(base(), { type: 'JAIL_PAY' });
  assert.equal(P(s, 'P1').cash, 5000 - CONFIG.jailFine);
  assert.ok(!P(s, 'P1').inJail);
  assert.deepEqual(s.phase, { t: 'turnStart' });

  s = base();
  P(s, 'P1').jailFreeCards = ['kismat'];
  s.decks.kismat.drawPile = s.decks.kismat.drawPile.filter((id) => id !== 'k08');
  s = act(s, { type: 'JAIL_USE_CARD' });
  assert.ok(!P(s, 'P1').inJail);
  assert.equal(s.decks.kismat.drawPile.length, 16);
  assert.equal(s.decks.kismat.drawPile[15], 'k08');

  s = roll(base(), 2, 2); // doubles: leave and move 4 -> Indore
  assert.deepEqual(s.phase, { t: 'buyOrAuction', tile: 14 });
  s = act(s, { type: 'BUY' });
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false }); // no extra turn from jail doubles

  s = roll(base(), 1, 2);
  assert.ok(P(s, 'P1').inJail);
  assert.equal(P(s, 'P1').jailTurns, 1);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });

  const third = base();
  P(third, 'P1').jailTurns = 2;
  s = roll(third, 1, 2);
  assert.ok(!P(s, 'P1').inJail);
  assert.equal(P(s, 'P1').cash, 5000 - CONFIG.jailFine);
  assert.deepEqual(s.phase, { t: 'buyOrAuction', tile: 13 });
});

test('speed limit: over 9 jails, otherwise flag clears on move', () => {
  const hi = setup(mk(), 'P1', 0);
  P(hi, 'P1').speedLimit = true;
  let r = roll(hi, 5, 6);
  assert.ok(P(r, 'P1').inJail && !P(r, 'P1').speedLimit);
  const lo = setup(mk(), 'P1', 0);
  P(lo, 'P1').speedLimit = true;
  r = roll(lo, 3, 4);
  assert.ok(!P(r, 'P1').inJail && !P(r, 'P1').speedLimit);
  assert.equal(P(r, 'P1').position, 7);
});

test('cards: collect, pot fine, move, chain, jail, held jail-free, speed limit', () => {
  let s = act(showCard(mk(), 'P1', 7, 'k01'), { type: 'ACK_CARD' });
  assert.equal(P(s, 'P1').cash, 5200);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });

  s = act(showCard(mk(), 'P1', 7, 'k03'), { type: 'ACK_CARD' });
  assert.equal(P(s, 'P1').cash, 4850);
  assert.equal(s.pot, 150);

  s = act(showCard(mk(), 'P1', 7, 'k04'), { type: 'ACK_CARD' }); // Mumbai, no salary
  assert.equal(P(s, 'P1').cash, 5000);
  assert.deepEqual(s.phase, { t: 'buyOrAuction', tile: 39 });

  s = act(showCard(mk(), 'P1', 22, 'k05'), { type: 'ACK_CARD' }); // to Start, salary
  assert.equal(P(s, 'P1').cash, 5300);
  assert.equal(P(s, 'P1').position, 0);

  s = act(showCard(mk(), 'P1', 36, 'k06'), { type: 'ACK_CARD' }); // back 3 -> Khazana tile
  assert.equal(P(s, 'P1').position, 33);
  assert.equal(s.phase.t, 'cardShown');
  if (s.phase.t === 'cardShown') assert.equal(cardById(s.phase.cardId).deck, 'khazana');

  s = act(showCard(mk(), 'P1', 33, 'k06'), { type: 'ACK_CARD' }); // back 3 -> Go to Jail
  assert.ok(P(s, 'P1').inJail);

  s = act(showCard(mk(), 'P1', 2, 'k06'), { type: 'ACK_CARD' }); // back past Start, no salary
  assert.equal(P(s, 'P1').position, 39);
  assert.equal(P(s, 'P1').cash, 5000);

  s = act(showCard(mk(), 'P1', 36, 'k16'), { type: 'ACK_CARD' }); // forward 3 -> 39
  assert.equal(P(s, 'P1').position, 39);

  s = act(showCard(mk(), 'P1', 7, 'k07'), { type: 'ACK_CARD' });
  assert.ok(P(s, 'P1').inJail);

  s = act(showCard(mk(), 'P1', 7, 'k08'), { type: 'ACK_CARD' });
  assert.deepEqual(P(s, 'P1').jailFreeCards, ['kismat']);

  s = act(showCard(mk(), 'P1', 7, 'k09'), { type: 'ACK_CARD' });
  assert.ok(P(s, 'P1').speedLimit);
});

test('cards: pay each player, collect from each, repairs with no buildings', () => {
  let s = act(showCard(mk(4), 'P1', 7, 'k13'), { type: 'ACK_CARD' });
  assert.equal(P(s, 'P1').cash, 5000 - 300);
  assert.ok(s.players.filter((p) => p.name !== 'P1').every((p) => p.cash === 5100));

  s = act(showCard(mk(4), 'P1', 2, 'z02'), { type: 'ACK_CARD' });
  assert.equal(P(s, 'P1').cash, 5300);
  assert.ok(s.players.filter((p) => p.name !== 'P1').every((p) => p.cash === 4900));

  s = act(showCard(mk(4), 'P1', 2, 'z11'), { type: 'ACK_CARD' });
  assert.equal(P(s, 'P1').cash, 5000);
});

test('debt: short payer must go bankrupt, creditor takes cash, queue continues', () => {
  let s = showCard(mk(4), 'P1', 2, 'z02');
  P(s, 'P2').cash = 50;
  s = act(s, { type: 'ACK_CARD' });
  assert.equal(s.phase.t, 'debt');
  if (s.phase.t === 'debt') assert.equal(s.phase.debt.debtor, P(s, 'P2').id);
  rejected(s, { type: 'PAY_DEBT' });
  s = act(s, { type: 'DECLARE_BANKRUPTCY' });
  assert.ok(P(s, 'P2').bankrupt);
  assert.equal(P(s, 'P1').cash, 5000 + 50 + 100 + 100);
  assert.deepEqual(s.phase, { t: 'turnEnd', rollAgain: false });
});

test('bankruptcy to a player: tiles and cash transfer, turn order skips them', () => {
  const s = setup(mk(3), 'P1', 0);
  P(s, 'P1').cash = 10;
  s.properties[tile('Delhi')].owner = P(s, 'P1').id;
  s.properties[5].owner = P(s, 'P2').id;
  let r = roll(s, 2, 3);
  assert.equal(r.phase.t, 'debt');
  rejected(r, { type: 'PAY_DEBT' });
  r = act(r, { type: 'DECLARE_BANKRUPTCY' });
  assert.ok(P(r, 'P1').bankrupt);
  assert.equal(P(r, 'P2').cash, 5010);
  assert.equal(r.properties[tile('Delhi')].owner, P(r, 'P2').id);
  assert.equal(ownedTiles(r, P(r, 'P1').id).length, 0);
  r = act(r, { type: 'END_TURN' });
  assert.ok(!currentPlayer(r).bankrupt);
});

test('bankruptcy to bank or pot: tiles return unowned', () => {
  const s = setup(mk(3), 'P1', 0);
  P(s, 'P1').cash = 10;
  s.properties[tile('Delhi')].owner = P(s, 'P1').id;
  let r = roll(s, 1, 3); // Income Tax
  assert.equal(r.phase.t, 'debt');
  r = act(r, { type: 'DECLARE_BANKRUPTCY' });
  assert.equal(r.properties[tile('Delhi')].owner, null);
  assert.equal(r.pot, 0);
});

test('last player standing ends the game', () => {
  const s = setup(mk(3), 'P2', 0);
  P(s, 'P1').bankrupt = true;
  P(s, 'P2').cash = 10;
  s.properties[5].owner = P(s, 'P3').id;
  let r = roll(s, 2, 3);
  r = act(r, { type: 'DECLARE_BANKRUPTCY' });
  assert.deepEqual(r.phase, { t: 'gameOver', winner: P(r, 'P3').id, reason: 'lastStanding' });
  assert.deepEqual(legalActions(r), []);
});

test('rounds mode: ends after the last round, richest net worth wins', () => {
  let s = mk(3, { mode: 'rounds', rounds: 5 });
  s.round = 5;
  s.current = 2;
  s.phase = { t: 'turnEnd', rollAgain: false };
  P(s, 'P2').cash = 7000;
  s = act(s, { type: 'END_TURN' });
  assert.deepEqual(s.phase, { t: 'gameOver', winner: P(s, 'P2').id, reason: 'netWorth' });

  let t = mk(3, { mode: 'rounds', rounds: 5 });
  t.current = 2;
  t.phase = { t: 'turnEnd', rollAgain: false };
  t = act(t, { type: 'END_TURN' });
  assert.equal(t.round, 2);
  assert.equal(t.current, 0);
  assert.equal(t.phase.t, 'turnStart');
});

test('rentFor: city with houses reads the tier (state edit)', () => {
  const s = mk();
  const i = tile('Mumbai');
  s.properties[i].owner = 'p1';
  s.properties[i].houses = 2;
  assert.equal(rentFor(s, i, 7), rentOf('Mumbai')[2]);
});

test('illegal actions leave state untouched', () => {
  const s = mk();
  for (const a of [{ type: 'BUY' }, { type: 'END_TURN' }, { type: 'ACK_CARD' }, { type: 'PAY_DEBT' }, { type: 'JAIL_PAY' }, { type: 'BUILD', tile: 1 }] as Action[]) {
    rejected(s, a);
  }
});

test('reduce never mutates its input', () => {
  const s = mk();
  const before = JSON.stringify(s);
  reduce(s, { type: 'ROLL' });
  assert.equal(JSON.stringify(s), before);
});

// ---------------------------------------------------------------- buildings, mortgage, trade, bankruptcy auctions
const own = (s: GameState, name: string, tiles: number[]): void => {
  for (const i of tiles) s.properties[i].owner = P(s, name).id;
};
const LB = [6, 8, 9]; // light blue: Dehradun, Shimla, Amritsar
function setHouses(s: GameState, tiles: number[], houses: number[]): void {
  tiles.forEach((i, k) => (s.properties[i].houses = houses[k]));
  let h = 0;
  let ho = 0;
  for (const pr of Object.values(s.properties)) {
    if (pr.houses === 5) ho++;
    else h += pr.houses;
  }
  s.houseStock = CONFIG.supply.houses - h;
  s.hotelStock = CONFIG.supply.hotels - ho;
}
const offer = (s: GameState, from: string, to: string, give: Partial<TradeSide>, get: Partial<TradeSide>): Action => ({
  type: 'TRADE_PROPOSE',
  offer: {
    from: P(s, from).id,
    to: P(s, to).id,
    give: { cash: 0, tiles: [], jailFree: [], ...give },
    get: { cash: 0, tiles: [], jailFree: [], ...get },
  },
});

test('build: evenly, price per level, hotel returns 4 houses to stock', () => {
  let s = setup(mk(), 'P1', 0);
  own(s, 'P1', LB);
  s = act(s, { type: 'BUILD', tile: 6 });
  assert.equal(s.properties[6].houses, 1);
  assert.equal(P(s, 'P1').cash, 5000 - 150);
  assert.equal(s.houseStock, 31);
  rejected(s, { type: 'BUILD', tile: 6 }); // uneven
  for (let pass = 0; pass < 12; pass++) for (const i of LB) if (s.properties[i].houses < 4) s = reduce(s, { type: 'BUILD', tile: i });
  assert.deepEqual(LB.map((i) => s.properties[i].houses), [4, 4, 4]);
  assert.equal(s.houseStock, 20);
  assert.equal(P(s, 'P1').cash, 5000 - 12 * 150);
  s = act(s, { type: 'BUILD', tile: 6 }); // hotel
  assert.equal(s.properties[6].houses, 5);
  assert.equal(s.hotelStock, 11);
  assert.equal(s.houseStock, 24);
  assert.equal(P(s, 'P1').cash, 5000 - 13 * 150);
  rejected(s, { type: 'BUILD', tile: 6 });
  assert.equal(rentFor(s, 6, 7), rentOf('Dehradun')[5]);
});

test('build rejected: partial group, mortgaged member, no cash, no stock, holy, bad tile, wrong phase, not owner', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P1', [6, 8]);
  rejected(s, { type: 'BUILD', tile: 6 });
  own(s, 'P1', LB);
  s.properties[9].mortgaged = true;
  rejected(s, { type: 'BUILD', tile: 6 });
  s.properties[9].mortgaged = false;
  P(s, 'P1').cash = 100;
  rejected(s, { type: 'BUILD', tile: 6 });
  P(s, 'P1').cash = 5000;
  s.houseStock = 0;
  rejected(s, { type: 'BUILD', tile: 6 });
  s.houseStock = 32;
  own(s, 'P1', [1]);
  rejected(s, { type: 'BUILD', tile: 1 });
  rejected(s, { type: 'BUILD', tile: 999 });
  const mid = structuredClone(s);
  mid.phase = { t: 'cardShown', cardId: 'k01' };
  rejected(mid, { type: 'BUILD', tile: 6 });
  const other = setup(structuredClone(s), 'P2', 0);
  rejected(other, { type: 'BUILD', tile: 6 });
  act(s, { type: 'BUILD', tile: 6 });
});

test('sell: half refund, even selling, hotel steps down to 4 houses', () => {
  let s = setup(mk(), 'P1', 0);
  own(s, 'P1', LB);
  setHouses(s, LB, [5, 4, 4]);
  rejected(s, { type: 'SELL_BUILDING', tile: 8 }); // tile 6 is highest
  s = act(s, { type: 'SELL_BUILDING', tile: 6 });
  assert.equal(s.properties[6].houses, 4);
  assert.equal(P(s, 'P1').cash, 5000 + 75);
  assert.equal(s.hotelStock, 12);
  assert.equal(s.houseStock, 20);
  s = act(s, { type: 'SELL_BUILDING', tile: 9 });
  assert.equal(P(s, 'P1').cash, 5150);
  assert.equal(s.houseStock, 21);
  const t = setup(mk(), 'P1', 0);
  own(t, 'P1', LB);
  setHouses(t, LB, [5, 4, 4]);
  t.houseStock = 3;
  rejected(t, { type: 'SELL_BUILDING', tile: 6 });
});

test('mortgage and unmortgage: values, interest rounding, building rule', () => {
  assert.equal(unmortgageCost(600), 330);
  assert.equal(unmortgageCost(350), 193);
  let s = setup(mk(), 'P1', 0);
  own(s, 'P1', [1]);
  s = act(s, { type: 'MORTGAGE', tile: 1 });
  assert.equal(P(s, 'P1').cash, 5300);
  rejected(s, { type: 'MORTGAGE', tile: 1 });
  s = act(s, { type: 'UNMORTGAGE', tile: 1 });
  assert.equal(P(s, 'P1').cash, 5300 - 330);
  assert.equal(s.properties[1].mortgaged, false);
  const b = setup(mk(), 'P1', 0);
  own(b, 'P1', LB);
  setHouses(b, LB, [1, 0, 0]);
  rejected(b, { type: 'MORTGAGE', tile: 8 });
  const c = setup(mk(), 'P1', 0);
  own(c, 'P1', [1]);
  c.properties[1].mortgaged = true;
  P(c, 'P1').cash = 100;
  rejected(c, { type: 'UNMORTGAGE', tile: 1 });
});

test('debt: raise cash by mortgaging, then pay', () => {
  const s = setup(mk(3), 'P1', 0);
  P(s, 'P1').cash = 10;
  own(s, 'P2', [5]);
  own(s, 'P1', [37]);
  let r = roll(s, 2, 3);
  assert.equal(r.phase.t, 'debt');
  rejected(r, { type: 'PAY_DEBT' });
  r = act(r, { type: 'MORTGAGE', tile: 37 });
  assert.equal(P(r, 'P1').cash, 10 + 575);
  assert.equal(r.phase.t, 'debt');
  r = act(r, { type: 'PAY_DEBT' });
  assert.equal(P(r, 'P1').cash, 10 + 575 - 85);
  assert.deepEqual(r.phase, { t: 'turnEnd', rollAgain: false });
});

test('debt: sell a building to cover rent', () => {
  const s = setup(mk(3), 'P1', 0);
  own(s, 'P1', LB);
  setHouses(s, LB, [1, 1, 1]);
  P(s, 'P1').cash = 10;
  own(s, 'P2', [5]);
  let r = roll(s, 2, 3);
  r = act(r, { type: 'SELL_BUILDING', tile: 6 });
  r = act(r, { type: 'PAY_DEBT' });
  assert.equal(P(r, 'P1').cash, 0);
});

test('debt: a debtor who is not on turn raises cash with their own tiles only', () => {
  const base = showCard(mk(4), 'P1', 2, 'z02');
  P(base, 'P2').cash = 50;
  own(base, 'P2', [1]);
  own(base, 'P1', [37]);
  let s = act(base, { type: 'ACK_CARD' });
  assert.equal(s.phase.t, 'debt');
  rejected(s, { type: 'MORTGAGE', tile: 37 }); // belongs to P1, not the debtor
  s = act(s, { type: 'MORTGAGE', tile: 1 });
  s = act(s, { type: 'PAY_DEBT' });
  assert.equal(P(s, 'P2').cash, 50 + 300 - 100);
});

test('bankruptcy to player: buildings sold at half to the bank, creditor gets the cash', () => {
  const s = setup(mk(3), 'P1', 0);
  own(s, 'P1', LB);
  setHouses(s, LB, [2, 2, 2]);
  P(s, 'P1').cash = 10;
  own(s, 'P2', [5]);
  let r = roll(s, 2, 3);
  r = act(r, { type: 'DECLARE_BANKRUPTCY' });
  assert.equal(P(r, 'P2').cash, 5000 + 10 + 6 * 75);
  assert.ok(LB.every((i) => r.properties[i].houses === 0 && r.properties[i].owner === P(r, 'P2').id));
  assert.equal(r.houseStock, 32);
});

test('bankruptcy to bank: assets auctioned one by one, mortgaged ones come back clean', () => {
  const s = setup(mk(3), 'P1', 0);
  P(s, 'P1').cash = 10;
  own(s, 'P1', [37, 39]);
  s.properties[39].mortgaged = true;
  let r = roll(s, 1, 3); // Income Tax
  r = act(r, { type: 'DECLARE_BANKRUPTCY' });
  assert.equal(r.phase.t, 'auction');
  if (r.phase.t !== 'auction') return;
  assert.equal(r.phase.auction.tile, 37);
  assert.deepEqual(r.pendingAuctions, [39]);
  assert.ok(!r.phase.auction.inAuction.includes(P(r, 'P1').id));
  for (const id of [...r.phase.auction.inAuction]) r = act(r, { type: 'AUCTION_PASS', player: id });
  assert.equal(r.properties[37].owner, null);
  assert.equal(r.phase.t, 'auction');
  if (r.phase.t !== 'auction') return;
  assert.equal(r.phase.auction.tile, 39);
  const [a, b] = r.phase.auction.inAuction;
  r = act(r, { type: 'AUCTION_BID', player: a, amount: 100 });
  r = act(r, { type: 'AUCTION_PASS', player: b });
  assert.equal(r.properties[39].owner, a);
  assert.equal(r.properties[39].mortgaged, false);
  assert.deepEqual(r.phase, { t: 'turnEnd', rollAgain: false });
});

test('trade: cash for tile, both sides update, other actions blocked while open', () => {
  let s = setup(mk(), 'P1', 0);
  own(s, 'P2', [37]);
  s = act(s, offer(s, 'P1', 'P2', { cash: 1000 }, { tiles: [37] }));
  assert.ok(s.pendingTrade);
  for (const a of [{ type: 'ROLL' }, { type: 'END_TURN' }, { type: 'BUILD', tile: 6 }, { type: 'MORTGAGE', tile: 37 }] as Action[]) rejected(s, a);
  assert.deepEqual(legalActions(s).map((a) => a.type), ['TRADE_ACCEPT', 'TRADE_DECLINE']);
  rejected(s, offer(s, 'P1', 'P2', { cash: 5 }, {})); // second proposal while one is open
  s = act(s, { type: 'TRADE_ACCEPT' });
  assert.equal(P(s, 'P1').cash, 4000);
  assert.equal(P(s, 'P2').cash, 6000);
  assert.equal(s.properties[37].owner, P(s, 'P1').id);
  assert.equal(s.pendingTrade, null);
  assert.deepEqual(s.phase, { t: 'turnStart' });
});

test('trade: decline clears it; bad offers are rejected', () => {
  const base = setup(mk(), 'P1', 0);
  own(base, 'P2', [37]);
  own(base, 'P1', [1]);
  let s = act(base, offer(base, 'P1', 'P2', { cash: 100 }, { tiles: [37] }));
  s = act(s, { type: 'TRADE_DECLINE' });
  assert.equal(s.pendingTrade, null);
  assert.equal(s.properties[37].owner, P(s, 'P2').id);
  rejected(base, offer(base, 'P1', 'P2', {}, { tiles: [1] })); // P2 does not own tile 1
  rejected(base, offer(base, 'P1', 'P2', { cash: 99999 }, { tiles: [37] }));
  rejected(base, offer(base, 'P1', 'P2', {}, {})); // empty
  rejected(base, offer(base, 'P1', 'P1', { cash: 5 }, {})); // with self
  rejected(base, offer(base, 'P2', 'P1', { cash: 5 }, {})); // proposer not on turn
  const mid = structuredClone(base);
  mid.phase = { t: 'cardShown', cardId: 'k01' };
  rejected(mid, offer(mid, 'P1', 'P2', { cash: 100 }, { tiles: [37] }));
  const b = setup(mk(), 'P1', 0);
  own(b, 'P1', LB);
  setHouses(b, LB, [1, 1, 1]);
  rejected(b, offer(b, 'P1', 'P2', { tiles: [6] }, { cash: 100 })); // buildings in that group
});

test('trade: mortgaged tile stays mortgaged and the receiver pays the fee', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P2', [1]);
  s.properties[1].mortgaged = true;
  let r = act(s, offer(s, 'P1', 'P2', { cash: 100 }, { tiles: [1] }));
  r = act(r, { type: 'TRADE_ACCEPT' });
  assert.equal(P(r, 'P1').cash, 5000 - 100 - 30);
  assert.equal(P(r, 'P2').cash, 5100);
  assert.equal(r.properties[1].owner, P(r, 'P1').id);
  assert.equal(r.properties[1].mortgaged, true);
  const poor = setup(mk(), 'P1', 0);
  own(poor, 'P2', [1]);
  poor.properties[1].mortgaged = true;
  P(poor, 'P1').cash = 120;
  rejected(poor, offer(poor, 'P1', 'P2', { cash: 100 }, { tiles: [1] }));
});

test('trade: Get-out-of-Jail cards can be swapped', () => {
  const s = setup(mk(), 'P1', 0);
  P(s, 'P1').jailFreeCards = ['kismat'];
  P(s, 'P2').jailFreeCards = ['khazana'];
  let r = act(s, offer(s, 'P1', 'P2', { jailFree: ['kismat'] }, { jailFree: ['khazana'] }));
  r = act(r, { type: 'TRADE_ACCEPT' });
  assert.deepEqual(P(r, 'P1').jailFreeCards, ['khazana']);
  assert.deepEqual(P(r, 'P2').jailFreeCards, ['kismat']);
  rejected(s, offer(s, 'P1', 'P2', { jailFree: ['khazana'] }, {})); // P1 holds no Khazana card
});

// ---------------------------------------------------------------- fuzz
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function invariants(s: GameState): void {
  const ids = new Set(s.players.map((p) => p.id));
  for (const p of s.players) {
    assert.ok(Number.isInteger(p.cash) && p.cash >= 0, `cash ${p.name} ${p.cash}`);
    assert.ok(p.position >= 0 && p.position < 40);
    if (p.bankrupt) {
      assert.equal(p.cash, 0);
      assert.equal(ownedTiles(s, p.id).length, 0);
      assert.equal(p.jailFreeCards.length, 0);
    }
  }
  assert.ok(Number.isInteger(s.pot) && s.pot >= 0);
  for (const deck of ['kismat', 'khazana'] as const) {
    const pile = s.decks[deck].drawPile;
    assert.equal(new Set(pile).size, pile.length, 'dup in pile');
    const held = s.players.flatMap((p) => p.jailFreeCards).filter((d) => d === deck).length;
    let shown = 0;
    if (s.phase.t === 'cardShown') {
      const c = cardById(s.phase.cardId);
      if (c.deck === deck && c.effect.type === 'jailFree') shown = 1;
    }
    assert.equal(pile.length + held + shown, cardsOf(deck).length, `deck ${deck} card count`);
  }
  for (const [i, pr] of Object.entries(s.properties)) {
    assert.ok(pr.owner === null || ids.has(pr.owner), `bad owner tile ${i}`);
    assert.ok(pr.owner === null || !s.players.find((p) => p.id === pr.owner)!.bankrupt);
    assert.ok(pr.houses >= 0 && pr.houses <= 5, 'houses range');
    assert.ok(pr.owner !== null || (pr.houses === 0 && !pr.mortgaged), 'unowned tile carries state');
  }
  let houses = 0;
  let hotels = 0;
  for (const pr of Object.values(s.properties)) {
    if (pr.houses === 5) hotels++;
    else houses += pr.houses;
  }
  assert.equal(s.houseStock + houses, CONFIG.supply.houses, 'house stock');
  assert.equal(s.hotelStock + hotels, CONFIG.supply.hotels, 'hotel stock');
  for (const group of Object.values(GROUP_TILES)) {
    const hs = group.map((i) => s.properties[i].houses);
    assert.ok(Math.max(...hs) - Math.min(...hs) <= 1, 'uneven buildings');
    if (Math.max(...hs) > 0) {
      assert.equal(new Set(group.map((i) => s.properties[i].owner)).size, 1, 'buildings need one owner');
      assert.ok(group.every((i) => !s.properties[i].mortgaged), 'buildings and mortgage in one group');
    }
  }
  assert.ok(s.players.filter((p) => !p.bankrupt).length >= 1);
}

function proposeTrade(rng: () => number, s: GameState): Action | null {
  const from = currentPlayer(s);
  const others = s.players.filter((p) => !p.bankrupt && p.id !== from.id);
  if (others.length === 0) return null;
  for (let k = 0; k < 6; k++) {
    const to = others[Math.floor(rng() * others.length)];
    const theirs = ownedTiles(s, to.id);
    if (theirs.length === 0) continue;
    const tileIdx = theirs[Math.floor(rng() * theirs.length)];
    const price = (BOARD[tileIdx] as { price: number }).price;
    const cash = Math.min(from.cash, Math.round((price * (0.7 + 0.6 * rng())) / 50) * 50);
    const o: TradeOffer = { from: from.id, to: to.id, give: { cash, tiles: [], jailFree: [] }, get: { cash: 0, tiles: [tileIdx], jailFree: [] } };
    if (tradeCheck(s, o) === null) return { type: 'TRADE_PROPOSE', offer: o };
  }
  return null;
}

function pick(rng: () => number, s: GameState): Action {
  const rnd = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  if (s.pendingTrade) return { type: rng() < 0.6 ? 'TRADE_ACCEPT' : 'TRADE_DECLINE' };
  const legal = legalActions(s);
  const find = (t: Action['type']): Action | undefined => legal.find((a) => a.type === t);
  const mgr = managerActions(s);
  const of = (t: Action['type']): Action[] => mgr.filter((a) => a.type === t);
  switch (s.phase.t) {
    case 'debt': {
      const pay = find('PAY_DEBT');
      if (pay) return pay;
      return of('SELL_BUILDING')[0] ?? of('MORTGAGE')[0] ?? (find('DECLARE_BANKRUPTCY') as Action);
    }
    case 'buyOrAuction': {
      const buy = find('BUY');
      return buy && rng() < 0.75 ? buy : (find('DECLINE_BUY') as Action);
    }
    case 'auction': {
      const bid = find('AUCTION_BID');
      return bid && rng() < 0.35 ? bid : (find('AUCTION_PASS') as Action);
    }
    case 'turnStart':
    case 'turnEnd': {
      const r = rng();
      if (r < 0.4 && of('BUILD').length > 0) return rnd(of('BUILD'));
      if (r < 0.5 && of('UNMORTGAGE').length > 0) return rnd(of('UNMORTGAGE'));
      if (r < 0.56) {
        const t = proposeTrade(rng, s);
        if (t) return t;
      }
      if (s.phase.t === 'turnStart' && rng() < 0.5) {
        const j = find('JAIL_PAY') ?? find('JAIL_USE_CARD');
        if (j) return j;
      }
      return (find('ROLL') ?? find('END_TURN')) as Action;
    }
    default:
      return legal[0];
  }
}

interface FuzzResult { s: GameState; steps: number; seen: Set<string>; trace: string }
function playGame(seed: number, n: number, win: WinCondition, maxSteps: number): FuzzResult {
  const rng = mulberry(seed * 7919 + 13);
  let s = mk(n, win, seed);
  const seen = new Set<string>();
  let steps = 0;
  let trace = '';
  while (s.phase.t !== 'gameOver' && steps < maxSteps) {
    const a = pick(rng, s);
    const next = reduce(s, a);
    assert.notEqual(next, s, `bot chose illegal ${a.type} in phase ${s.phase.t}`);
    seen.add(a.type);
    s = next;
    steps++;
    trace += a.type[0];
    invariants(s);
  }
  return { s, steps, seen, trace };
}

test('fuzz: 40 rounds-mode games finish, invariants hold, winner has top net worth', () => {
  const seen = new Set<string>();
  let bankruptcies = 0;
  for (let g = 0; g < 40; g++) {
    const n = 3 + (g % 4);
    const rounds = ([5, 10, 15, 20, 30] as const)[g % 5];
    const { s, steps, seen: sn } = playGame(g + 1, n, { mode: 'rounds', rounds }, 30000);
    assert.equal(s.phase.t, 'gameOver', `game ${g} did not finish in ${steps} steps`);
    sn.forEach((x) => seen.add(x));
    bankruptcies += s.players.filter((p) => p.bankrupt).length;
    if (s.phase.t === 'gameOver' && s.phase.reason === 'netWorth') {
      const top = Math.max(...s.players.filter((p) => !p.bankrupt).map((p) => netWorth(s, p.id)));
      assert.equal(netWorth(s, s.phase.winner), top);
      assert.ok(s.round <= rounds + 1);
    }
  }
  console.log(`      action types seen: ${[...seen].sort().join(', ')}; bankruptcies: ${bankruptcies}`);
  for (const must of ['ROLL', 'BUY', 'DECLINE_BUY', 'AUCTION_BID', 'AUCTION_PASS', 'ACK_CARD', 'END_TURN', 'BUILD', 'MORTGAGE', 'TRADE_PROPOSE', 'TRADE_ACCEPT']) {
    assert.ok(seen.has(must), `fuzz never exercised ${must}`);
  }
});

test('fuzz: 20 last-standing games stay valid (finish rate reported)', () => {
  let finished = 0;
  let totalSteps = 0;
  const seen = new Set<string>();
  const rounds: number[] = [];
  for (let g = 0; g < 20; g++) {
    const r = playGame(100 + g, 3 + (g % 4), { mode: 'lastStanding' }, 12000);
    totalSteps += r.steps;
    r.seen.forEach((x) => seen.add(x));
    if (r.s.phase.t === 'gameOver') finished++;
    rounds.push(r.s.round);
  }
  rounds.sort((a, b) => a - b);
  console.log(`      finished ${finished}/20 within 12000 steps; avg steps ${Math.round(totalSteps / 20)}; rounds min/median/max = ${rounds[0]}/${rounds[10]}/${rounds[19]}`);
});

test('determinism: same seed and same choices give identical games', () => {
  const a = playGame(5, 4, { mode: 'rounds', rounds: 10 }, 30000);
  const b = playGame(5, 4, { mode: 'rounds', rounds: 10 }, 30000);
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  assert.equal(a.trace, b.trace);
});

console.log(failed.length === 0 ? `\nALL ${passed} TESTS PASSED` : `\n${failed.length} FAILED, ${passed} passed: ${failed.join(' | ')}`);
process.exit(failed.length === 0 ? 0 : 1);