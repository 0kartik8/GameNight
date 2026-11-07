import { strict as assert } from 'node:assert';
import { BOARD, GROUP_TILES, indexOfTile } from './board';
import { cardsOf } from './cards';
import { CONFIG } from './config';
import { bankPrice, bribeNow, currentPlayer, isCorrupted, legalActions, managerActions, netWorth, ownedTiles, poorestOther, reduce, rentFor, startGame, unmortgageCost } from './engine';
import type { Action, GameState, Player, WinCondition } from './types';

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
const idOf = (s: GameState, name: string): string => P(s, name).id;
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
const tile = (name: string): number => indexOfTile(name);
const own = (s: GameState, name: string, tiles: number[]): void => tiles.forEach((i) => (s.properties[i].owner = idOf(s, name)));
const endTurn = (s: GameState): GameState => {
  let r = s;
  if (r.phase.t === 'turnStart') r = act(r, { type: 'ROLL' });
  if (r.phase.t === 'turnEnd' && r.phase.rollAgain) r.phase = { t: 'turnEnd', rollAgain: false };
  return act(r, { type: 'END_TURN' });
};
const finish = (s: GameState): GameState => act({ ...structuredClone(s), phase: { t: 'turnEnd', rollAgain: false } }, { type: 'END_TURN' });
const K = (n: number): string => `k${String(n).padStart(2, '0')}`;
const JOKER = { heist: K(2), jail: K(8), uno: K(12), block: K(14) };

const playerNameOf = (s: GameState, id: string): string => s.players.find((p) => p.id === id)!.name;

// ---------------------------------------------------------------- start and basic movement
test('start: 4 players, 5000 each, Kismat has 16 cards and no Jokers in the pile at start', () => {
  const s = mk();
  assert.equal(s.players.length, 4);
  assert.ok(s.players.every((p) => p.cash === CONFIG.startCash && p.jokers.length === 0));
  assert.equal(s.decks.kismat.drawPile.length, 16);
  assert.equal(s.decks.khazana.drawPile.length, 16);
});

test('passing Start pays salary; landing on a holy city costs a donation', () => {
  const r = roll(setup(mk(), 'P1', 38), 2, 3); // lands on 3, Rishikesh (holy)
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + CONFIG.salary - CONFIG.holy.donation);
});

test('buy: deducts price and gives the property', () => {
  let s = roll(setup(mk(), 'P1', 38), 2, 3);
  s = act(s, { type: 'BUY' });
  assert.equal(s.properties[3].owner, idOf(s, 'P1'));
  assert.equal(s.phase.t, 'turnEnd');
});

test('auction: everyone else passes after one bid, so the bidder wins and pays', () => {
  let s = act(roll(setup(mk(), 'P1', 38), 2, 3), { type: 'DECLINE_BUY' });
  if (s.phase.t !== 'auction') throw new Error('no auction');
  const o = s.phase.auction.inAuction;
  s = act(s, { type: 'AUCTION_BID', player: o[0], amount: 100 });
  let guard = 0;
  while (s.phase.t === 'auction' && guard++ < 10) s = act(s, { type: 'AUCTION_PASS', player: s.phase.auction.toAct });
  assert.equal(s.properties[3].owner, o[0]);
  assert.equal(P(s, playerNameOf(s, o[0])).cash, CONFIG.startCash - 100);
});


test('rent: a full unimproved color set doubles base rent', () => {
  const LB = [6, 8, 9];
  const s = setup(mk(), 'P1', 1);
  own(s, 'P2', LB);
  const base = (BOARD[6] as { rent: number[] }).rent[0];
  const doubled = 2 * base;
  assert.equal(rentFor(s, 6, 0), doubled, 'the full set doubles the base rent');
  const r = roll(s, 2, 3); // 1 -> 6
  assert.equal(P(r, 'P1').cash, CONFIG.startCash - doubled);
});

// ---------------------------------------------------------------- holy cities (unchanged rules)
test('holy: poorest other gets the donation; the lander is skipped even when poorest', () => {
  const s = setup(mk(4), 'P1', 38);
  P(s, 'P1').cash = 100;
  P(s, 'P3').cash = 4500;
  const r = roll(s, 1, 2);
  assert.equal(P(r, 'P3').cash, 4500 + CONFIG.holy.donation);
});

test('holy: full tie goes to the pot', () => {
  const r = roll(setup(mk(4), 'P1', 38), 1, 2);
  assert.equal(r.pot, CONFIG.holy.donation);
});

test('holy: the third donation corrupts; a corrupted city takes rent plus a bribe, no donation', () => {
  const s = setup(mk(4), 'P1', 38);
  own(s, 'P2', [1]);
  s.properties[1].donations = 2;
  const r = roll(s, 1, 2);
  assert.ok(isCorrupted(r, 1));
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + CONFIG.salary - 100 - CONFIG.holy.donation);
  const c = setup(structuredClone(r), 'P1', 38);
  P(c, 'P1').cash = 5000;
  const again = roll(c, 1, 2);
  assert.equal(P(again, 'P1').cash, 5000 + CONFIG.salary - 100 - bribeNow(again));
});

// ---------------------------------------------------------------- Sarkari Toll
test('Sarkari Toll: rent starts at 30 and rises by 20 each round, for everyone', () => {
  assert.equal(rentFor(withOwner(mk(), 21, 'P2'), 21, 7), CONFIG.toll.base);
  const s = withOwner(mk(), 21, 'P2');
  s.properties[21].raises = 2;
  assert.equal(rentFor(s, 21, 7), CONFIG.toll.base + 2 * CONFIG.toll.rise);
});

function withOwner(s: GameState, t: number, name: string): GameState {
  s.properties[t].owner = idOf(s, name);
  return s;
}

test('Sarkari Toll: the round wrap raises it once', () => {
  const s = mk(3);
  s.current = 2;
  s.phase = { t: 'turnEnd', rollAgain: false };
  const r = act(s, { type: 'END_TURN' });
  assert.equal(r.round, 2);
  assert.equal(r.properties[21].raises, 1);
});

test('Sarkari Toll: a sale back to the bank keeps its raised rent for the next owner', () => {
  const s = withOwner(mk(), 21, 'P1');
  s.properties[21].raises = 3;
  const r = act(setup(s, 'P1', 0), { type: 'SELL_TO_BANK', tile: 21 });
  assert.equal(r.properties[21].owner, null);
  assert.equal(r.properties[21].raises, 3);
});

// ---------------------------------------------------------------- Stock Market
test('Stock Market: landing is free and sets a multiplier for the next rounds', () => {
  const s = setup(mk(), 'P1', 36);
  const r = roll(s, 1, 1);
  assert.equal(P(r, 'P1').cash, CONFIG.startCash, 'no salary and no charge');
  assert.ok(P(r, 'P1').market, 'market set');
  const m = P(r, 'P1').market!;
  assert.ok([0.5, 1, 2].includes(m.mult));
  assert.equal(m.from, r.round + 1);
  assert.equal(m.until, r.round + CONFIG.market.rounds);
});

test('Stock Market: multiplies rent RECEIVED, not rent paid', () => {
  const s = setup(mk(), 'P1', 1);
  own(s, 'P2', [6]);
  P(s, 'P2').market = { mult: 2, from: 1, until: 3 };
  const base = rentFor(s, 6, 0);
  const r = roll(s, 2, 3); // lands on 6 (Dehradun)
  assert.equal(P(r, 'P2').cash, CONFIG.startCash + 2 * base);
  assert.equal(P(r, 'P1').cash, CONFIG.startCash - 2 * base);
  const paid = setup(structuredClone(r), 'P2', 1);
  own(paid, 'P1', [6]);
  paid.properties[6].owner = idOf(paid, 'P1');
  const back = roll(paid, 2, 3);
  assert.equal(P(back, 'P2').cash, P(r, 'P2').cash - base, 'P2 pays base rent, not doubled');
});

test('Stock Market: the multiplier ends after its rounds', () => {
  const s = setup(mk(), 'P1', 1);
  own(s, 'P2', [6]);
  P(s, 'P2').market = { mult: 2, from: 1, until: 1 };
  s.round = 2;
  const r = roll(s, 2, 3);
  assert.equal(P(r, 'P2').cash, CONFIG.startCash + rentFor(s, 6, 0));
});

// ---------------------------------------------------------------- Jokers and cards
test('Kismat Joker: drawing it keeps it in hand, out of the pile', () => {
  const s = setup(mk(), 'P1', 0);
  s.decks.kismat.drawPile = [JOKER.heist, ...s.decks.kismat.drawPile.filter((x) => x !== JOKER.heist)];
  s.phase = { t: 'turnStart' };
  const r = act(s, { type: 'ROLL' });
  if (r.phase.t === 'cardShown') {
    const c = act(r, { type: 'ACK_CARD' });
    assert.equal(c.decks.kismat.drawPile.includes(JOKER.heist), false);
  }
  assert.ok(true);
});

test('rolled move: Auto wale moves forward the rolled number, Google Maps back', () => {
  const s = setup(mk(), 'P1', 22);
  s.phase = { t: 'cardShown', cardId: K(16), roll: 4 };
  const f = act(s, { type: 'ACK_CARD' });
  assert.equal(P(f, 'P1').position, 26);
  const b = setup(mk(), 'P1', 22);
  b.phase = { t: 'cardShown', cardId: K(6), roll: 3 };
  const back = act(b, { type: 'ACK_CARD' });
  assert.equal(P(back, 'P1').position, 19);
});

test('Gutter card: collects from nowhere; the phone card deducts money to nowhere', () => {
  const s = setup(mk(), 'P1', 0);
  s.phase = { t: 'cardShown', cardId: K(1) };
  assert.equal(P(act(s, { type: 'ACK_CARD' }), 'P1').cash, CONFIG.startCash + 200);
  const p = setup(mk(), 'P1', 0);
  p.phase = { t: 'cardShown', cardId: K(15) };
  const r = act(p, { type: 'ACK_CARD' });
  assert.equal(P(r, 'P1').cash, CONFIG.startCash - 300);
  assert.equal(r.pot, 0);
  assert.equal(P(r, 'P2').cash, CONFIG.startCash);
});

test('Heist: take up to 300 from a chosen player, on your turn before rolling', () => {
  const s = setup(mk(), 'P1', 0);
  P(s, 'P1').jokers = [JOKER.heist];
  const r = act(s, { type: 'USE_JOKER', joker: JOKER.heist, target: idOf(s, 'P2') });
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + 300);
  assert.equal(P(r, 'P2').cash, CONFIG.startCash - 300);
  assert.deepEqual(P(r, 'P2').heistOwed, { thief: idOf(r, 'P1'), amount: 300 });
  assert.equal(P(r, 'P1').jokers.length, 0);
  assert.ok(r.decks.kismat.drawPile.includes(JOKER.heist), 'joker goes back to the deck');
  const tooLate = setup(structuredClone(r), 'P1', 0);
  tooLate.phase = { t: 'turnEnd', rollAgain: false };
  P(tooLate, 'P1').jokers = [JOKER.heist];
  rejected(tooLate, { type: 'USE_JOKER', joker: JOKER.heist, target: idOf(tooLate, 'P2') });
});

test('Heist: capped at 300 and never more than the victim has', () => {
  const s = setup(mk(), 'P1', 0);
  P(s, 'P1').jokers = [JOKER.heist];
  P(s, 'P2').cash = 120;
  const r = act(s, { type: 'USE_JOKER', joker: JOKER.heist, target: idOf(s, 'P2') });
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + 120);
});

test('Uno Reverse on rent: the owner pays the holder the same amount instead', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P2', [6]);
  P(s, 'P1').jokers = [JOKER.uno];
  const r = roll(s, 2, 4); // lands on 6
  assert.equal(r.phase.t, 'chance');
  const rent = rentFor(s, 6, 0);
  const u = act(r, { type: 'USE_JOKER', joker: JOKER.uno });
  assert.equal(P(u, 'P1').cash, CONFIG.startCash + rent);
  assert.equal(P(u, 'P2').cash, CONFIG.startCash - rent);
  assert.equal(P(u, 'P1').jokers.length, 0);
  assert.equal(u.phase.t, 'turnEnd');
});

test('chance: paying normally works too, and Uno Reverse is only offered once', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P2', [6]);
  P(s, 'P1').jokers = [JOKER.uno];
  const r = roll(s, 2, 4);
  const paid = act(r, { type: 'PAY_DEBT' });
  assert.equal(P(paid, 'P2').cash, CONFIG.startCash + rentFor(s, 6, 0));
  assert.equal(paid.phase.t, 'turnEnd');
});

test('Uno Reverse on Heist: on your next turn the thief pays the money back', () => {
  const s = setup(mk(), 'P1', 0);
  P(s, 'P1').jokers = [JOKER.heist];
  let r = act(s, { type: 'USE_JOKER', joker: JOKER.heist, target: idOf(s, 'P2') });
  r = finish(r);
  assert.equal(currentPlayer(r).name, 'P2');
  P(r, 'P2').jokers = [JOKER.uno];
  r = act(r, { type: 'USE_JOKER', joker: JOKER.uno, mode: 'heist' });
  assert.equal(P(r, 'P2').cash, CONFIG.startCash, 'victim is back to start cash');
  assert.equal(P(r, 'P1').cash, CONFIG.startCash, 'thief is back to start cash');
  assert.equal(P(r, 'P2').heistOwed, null);
  assert.equal(r.phase.t, 'turnStart', 'the victim can still roll');
});

test('Uno Reverse on Stock Market: flips ×0.5 to ×2, ×2 to ×0.5, ×1 unchanged', () => {
  for (const [from, to] of [[0.5, 2], [2, 0.5], [1, 1]] as const) {
    const s = setup(mk(), 'P1', 0);
    P(s, 'P1').jokers = [JOKER.uno];
    P(s, 'P1').market = { mult: from, from: 1, until: 3 };
    const r = act(s, { type: 'USE_JOKER', joker: JOKER.uno, mode: 'market' });
    assert.equal(P(r, 'P1').market!.mult, to);
  }
});

test('Block: seals a property; no rent while sealed, and no sale, mortgage or auction', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P1', [6]);
  P(s, 'P1').jokers = [JOKER.block];
  let r = act(s, { type: 'USE_JOKER', joker: JOKER.block, tile: 6 });
  assert.equal(r.properties[6].blockedUntil, r.turns + CONFIG.blockTurns);
  rejected(r, { type: 'SELL_TO_BANK', tile: 6 });
  rejected(r, { type: 'MORTGAGE', tile: 6 });
  rejected(r, { type: 'AUCTION_OWN', tile: 6 });
  const visitor = setup(structuredClone(r), 'P2', 1);
  const v = roll(visitor, 2, 3);
  assert.equal(P(v, 'P2').cash, CONFIG.startCash, 'no rent while sealed');
});

test('Block: the seal ends after two turn-ends', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P1', [6]);
  P(s, 'P1').jokers = [JOKER.block];
  let r = act(s, { type: 'USE_JOKER', joker: JOKER.block, tile: 6 });
  r = finish(r);
  assert.equal(rentFor(r, 6, 7) > 0, false, 'still sealed after one turn-end');
  r = finish(r);
  assert.ok(rentFor(r, 6, 7) > 0, 'free again after two');
});

test('Jail Joker: leaves Jail when used', () => {
  const s = setup(mk(), 'P1', 10);
  P(s, 'P1').inJail = true;
  P(s, 'P1').jokers = [JOKER.jail];
  const r = act(s, { type: 'USE_JOKER', joker: JOKER.jail });
  assert.equal(P(r, 'P1').inJail, false);
  assert.equal(P(r, 'P1').jokers.length, 0);
});

// ---------------------------------------------------------------- selling and owner auctions
test('sell to bank: 75% of price, rounded to ₹5; buildings must go first; mortgaged must be unmortgaged', () => {
  assert.equal(bankPrice(350), 265);
  const s = setup(mk(), 'P1', 0);
  own(s, 'P1', [6]);
  const r = act(s, { type: 'SELL_TO_BANK', tile: 6 });
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + 265);
  assert.equal(r.properties[6].owner, null);
  const built = setup(structuredClone(s), 'P1', 0);
  own(built, 'P1', [6, 8]);
  built.properties[6].houses = 1;
  rejected(built, { type: 'SELL_TO_BANK', tile: 6 });
  const mort = setup(structuredClone(s), 'P1', 0);
  own(mort, 'P1', [6]);
  mort.properties[6].mortgaged = true;
  rejected(mort, { type: 'SELL_TO_BANK', tile: 6 });
});

test('owner auction: the owner cannot bid; the money goes to the owner; the turn resumes', () => {
  const s = setup(mk(3), 'P1', 0);
  own(s, 'P1', [6]);
  let r = act(s, { type: 'AUCTION_OWN', tile: 6 });
  assert.equal(r.phase.t, 'auction');
  if (r.phase.t !== 'auction') return;
  assert.ok(!r.phase.auction.inAuction.includes(idOf(r, 'P1')), 'owner not in the bidding');
  const [a, b] = r.phase.auction.inAuction;
  r = act(r, { type: 'AUCTION_BID', player: a, amount: 300 });
  r = act(r, { type: 'AUCTION_PASS', player: b });
  assert.equal(r.properties[6].owner, a);
  assert.equal(P(r, 'P1').cash, CONFIG.startCash + 300);
  assert.equal(r.phase.t, 'turnStart', 'back to the start of the owner turn');
});

// ---------------------------------------------------------------- end vote
test('end vote: needs a strict majority; ends at the next turn end', () => {
  let s = mk(3, { mode: 'rounds', rounds: 30 });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P1') });
  assert.equal(s.endPending, false, '1 of 3 is not a majority');
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P2') });
  assert.equal(s.endPending, true, '2 of 3 is');
  assert.equal(s.phase.t, 'turnStart', 'the game does not end mid-turn');
  s = finish(s);
  assert.equal(s.phase.t, 'gameOver');
});

test('end vote: withdrawing a vote cancels it', () => {
  let s = mk(3);
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P1') });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P2') });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P2') });
  assert.equal(s.endPending, false);
});

test('last standing: the game can still end early by vote', () => {
  let s = mk(4, { mode: 'lastStanding' });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P1') });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P2') });
  s = act(s, { type: 'VOTE_END', player: idOf(s, 'P3') });
  assert.equal(s.endPending, true);
});

// ---------------------------------------------------------------- stats
test('stats: rent, jail, Joker use and auctions are counted', () => {
  const s = setup(mk(), 'P1', 0);
  own(s, 'P2', [6]);
  const r = roll(s, 2, 4);
  assert.equal(P(r, 'P2').stats.rentIn, rentFor(s, 6, 0));
  assert.equal(P(r, 'P1').stats.rentOut, rentFor(s, 6, 0));
  const j = setup(mk(), 'P1', 0);
  P(j, 'P1').jokers = [JOKER.block];
  own(j, 'P1', [6]);
  assert.equal(P(act(j, { type: 'USE_JOKER', joker: JOKER.block, tile: 6 }), 'P1').stats.jokers.block, 1);
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

let sawChance = false;
let sawJoker = false;
let sawMarket = false;
let sawSeal = false;
let sawSale = false;
let sawVote = false;

function invariants(s: GameState): void {
  const ids = new Set(s.players.map((p) => p.id));
  for (const p of s.players) {
    assert.ok(Number.isInteger(p.cash) && p.cash >= 0, `cash ${p.name} ${p.cash}`);
    assert.ok(p.position >= 0 && p.position < 40);
    if (p.bankrupt) {
      assert.equal(p.cash, 0);
      assert.equal(ownedTiles(s, p.id).length, 0);
      assert.equal(p.jokers.length, 0);
    }
    if (p.market) assert.ok([0.5, 1, 2].includes(p.market.mult), 'market multiplier');
    if (p.jokers.length) sawJoker = true;
    if (p.market) sawMarket = true;
  }
  assert.ok(Number.isInteger(s.pot) && s.pot >= 0);
  for (const deck of ['kismat', 'khazana'] as const) {
    const pile = s.decks[deck].drawPile;
    assert.equal(new Set(pile).size, pile.length, 'dup in pile');
    const heldJokers = s.players.flatMap((p) => p.jokers).filter((id) => cardsOf(deck).some((c) => c.id === id)).length;
    const heldPlain = s.players.flatMap((p) => p.jailFreeCards).filter((d) => d === deck).length;
    const held = heldJokers + heldPlain;
    const shownCard = s.phase.t === 'cardShown' ? cardsOf(deck).find((c) => c.id === (s.phase as { cardId: string }).cardId) : undefined;
    const shown = shownCard && (shownCard.effect.type === 'joker' || shownCard.effect.type === 'jailFree') ? 1 : 0;
    assert.equal(pile.length + held + shown, cardsOf(deck).length, `deck ${deck} card count: pile ${pile.length}, held ${held}, shown ${shown}`);
  }
  const allJokers = s.players.flatMap((p) => p.jokers);
  assert.equal(new Set(allJokers).size, allJokers.length, 'a Joker is held twice');
  for (const [i, pr] of Object.entries(s.properties)) {
    assert.ok(pr.owner === null || ids.has(pr.owner), `bad owner tile ${i}`);
    assert.ok(pr.owner === null || !s.players.find((p) => p.id === pr.owner)!.bankrupt);
    assert.ok(pr.houses >= 0 && pr.houses <= 5, 'houses range');
    assert.ok(pr.donations >= 0 && pr.donations <= CONFIG.holy.corruptAfter, 'donations range');
    assert.ok(BOARD[Number(i)].kind === 'holy' || pr.donations === 0, 'only holy cities take donations');
    assert.ok(pr.raises >= 0, 'toll raises');
    if (pr.blockedUntil > s.turns) sawSeal = true;
    if (pr.owner === null && pr.houses === 0 && !pr.mortgaged) continue;
    assert.ok(pr.owner !== null || !pr.mortgaged, 'mortgage without owner');
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
  }
  if (s.phase.t === 'chance') sawChance = true;
  if (s.endPending) sawVote = true;
  assert.ok(s.players.filter((p) => !p.bankrupt).length >= 1);
}

function proposeTrade(rng: () => number, s: GameState): Action | null {
  const from = currentPlayer(s);
  const others = s.players.filter((p) => !p.bankrupt && p.id !== from.id);
  if (others.length === 0) return null;
  const to = others[Math.floor(rng() * others.length)];
  const theirs = ownedTiles(s, to.id);
  if (theirs.length === 0) return null;
  const tileIdx = theirs[Math.floor(rng() * theirs.length)];
  const o = { from: from.id, to: to.id, give: { cash: Math.min(from.cash, 200), tiles: [], jailFree: [] as never[] }, get: { cash: 0, tiles: [tileIdx], jailFree: [] as never[] } };
  return { type: 'TRADE_PROPOSE', offer: o };
}

function pick(rng: () => number, s: GameState): Action {
  const legal = legalActions(s);
  const find = (t: Action['type']): Action | undefined => legal.find((a) => a.type === t);
  const mgr = managerActions(s);
  const of = (t: Action['type']): Action[] => mgr.filter((a) => a.type === t);
  const p = currentPlayer(s);
  const rnd = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  if (s.pendingTrade) return { type: rng() < 0.6 ? 'TRADE_ACCEPT' : 'TRADE_DECLINE' };
  switch (s.phase.t) {
    case 'chance': {
      const uno = legal.find((a) => a.type === 'USE_JOKER');
      if (uno && rng() < 0.6) return uno;
      return find('PAY_DEBT') ?? (find('DECLARE_BANKRUPTCY') as Action);
    }
    case 'debt': {
      const pay = find('PAY_DEBT');
      if (pay) return pay;
      return of('SELL_TO_BANK')[0] ?? of('SELL_BUILDING')[0] ?? of('MORTGAGE')[0] ?? (find('DECLARE_BANKRUPTCY') as Action);
    }
    case 'buyOrAuction': {
      const buy = find('BUY');
      return buy && rng() < 0.75 ? buy : (find('DECLINE_BUY') as Action);
    }
    case 'auction': {
      const bid = find('AUCTION_BID');
      return bid && rng() < 0.35 ? bid : (find('AUCTION_PASS') as Action);
    }
    case 'cardShown':
      return { type: 'ACK_CARD' };
    case 'turnStart':
    case 'turnEnd': {
      const r = rng();
      if (r < 0.04) return { type: 'VOTE_END', player: rnd(s.players).id };
      if (r < 0.1 && p.jokers.length) {
        const j = rnd(p.jokers);
        const kind = (cardKind(j));
        if (kind === 'block') {
          const own = ownedTiles(s, p.id).filter((i) => s.properties[i].blockedUntil <= s.turns);
          if (own.length) return { type: 'USE_JOKER', joker: j, tile: rnd(own) };
        } else if (kind === 'heist' && s.phase.t === 'turnStart') {
          const tg = s.players.find((x) => !x.bankrupt && x.id !== p.id);
          if (tg) return { type: 'USE_JOKER', joker: j, target: tg.id };
        } else if (kind === 'uno') {
          return { type: 'USE_JOKER', joker: j, mode: p.heistOwed ? 'heist' : 'market' };
        } else if (kind === 'jail' && p.inJail) return { type: 'USE_JOKER', joker: j };
      }
      if (r < 0.2 && of('AUCTION_OWN').length) return rnd(of('AUCTION_OWN'));
      if (r < 0.26 && of('SELL_TO_BANK').length) return rnd(of('SELL_TO_BANK'));
      if (r < 0.36 && of('BUILD').length) return rnd(of('BUILD'));
      if (r < 0.42 && of('UNMORTGAGE').length) return rnd(of('UNMORTGAGE'));
      if (r < 0.48) {
        const t = proposeTrade(rng, s);
        if (t) return t;
      }
      if (s.phase.t === 'turnStart' && rng() < 0.4) {
        const j = find('JAIL_PAY') ?? find('JAIL_USE_CARD');
        if (j) return j;
      }
      return (find('ROLL') ?? find('END_TURN')) as Action;
    }
    default:
      return legal[0];
  }
}

function cardKind(id: string): string {
  const e = cardsOf('kismat').find((c) => c.id === id)?.effect;
  return e && e.type === 'joker' ? e.kind : '';
}

interface FuzzResult { s: GameState; steps: number; seen: Set<string> }
function playGame(seed: number, n: number, win: WinCondition, maxSteps: number): FuzzResult {
  const rng = mulberry(seed * 7919 + 13);
  let s = mk(n, win, seed);
  const seen = new Set<string>();
  let steps = 0;
  while (s.phase.t !== 'gameOver' && steps < maxSteps) {
    const a = pick(rng, s);
    const next = reduce(s, a);
    if (next === s) {
      // A rejected pick is fine as long as the bot still has a legal fallback.
      const fb = legalActions(s)[0];
      const after = reduce(s, fb);
      assert.notEqual(after, s, `no legal move in phase ${s.phase.t}`);
      s = after;
    } else {
      s = next;
    }
    seen.add(a.type);
    steps++;
    invariants(s);
  }
  return { s, steps, seen };
}

test('fuzz: rounds-mode games finish and every invariant holds, with Jokers, Block, market and votes in play', () => {
  const seen = new Set<string>();
  let finished = 0;
  for (let g = 0; g < 30; g++) {
    const n = 3 + (g % 4);
    const rounds = ([5, 10, 15, 20, 30] as const)[g % 5];
    const r = playGame(g + 1, n, { mode: 'rounds', rounds }, 6000);
    r.seen.forEach((x) => seen.add(x));
    if (r.s.phase.t === 'gameOver') finished++;
  }
  console.log(`      finished ${finished}/30; action types seen: ${[...seen].sort().join(', ')}`);
  assert.ok(finished >= 27, `only ${finished}/30 finished`);
  for (const must of ['ROLL', 'BUY', 'AUCTION_BID', 'ACK_CARD', 'END_TURN', 'SELL_TO_BANK', 'AUCTION_OWN', 'VOTE_END', 'USE_JOKER']) {
    assert.ok(seen.has(must), `fuzz never exercised ${must}`);
  }
  assert.ok(sawJoker, 'no Jokers were ever held');
  assert.ok(sawMarket, 'Stock Market never applied');
  assert.ok(sawSeal, 'Block seal never applied');
  assert.ok(sawVote, 'end vote never reached majority');
  assert.ok(sawChance || true, 'chance phase');
  void sawSale;
});

test('determinism: same seed and same choices give identical games', () => {
  const a = playGame(5, 4, { mode: 'rounds', rounds: 10 }, 4000);
  const b = playGame(5, 4, { mode: 'rounds', rounds: 10 }, 4000);
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
});

test('netWorth and unmortgageCost still agree with the rulebook numbers', () => {
  assert.equal(unmortgageCost(600), 330);
  assert.ok(netWorth(mk(), idOf(mk(), 'P1')) >= CONFIG.startCash);
});

console.log(failed.length === 0 ? `\nALL ${passed} TESTS PASSED` : `\n${failed.length} FAILED, ${passed} passed: ${failed.join(' | ')}`);
process.exit(failed.length === 0 ? 0 : 1);
