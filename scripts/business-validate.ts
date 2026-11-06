import { BOARD, GROUP_TILES, HOLY_TILES, RAIL_TILES, UTILITY_TILES, POS, isOwnable, mortgageValue } from '../src/games/business/board';
import type { Tile } from '../src/games/business/board';
import { CARDS, cardsOf } from '../src/games/business/cards';
import { CONFIG } from '../src/games/business/config';

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures++;
};
const count = (kind: Tile['kind']): number => BOARD.filter((t) => t.kind === kind).length;

// ---- board shape ----
check('board has 40 tiles', BOARD.length === 40, String(BOARD.length));
check('corners at 0/10/20/30', BOARD[POS.start].kind === 'start' && BOARD[POS.jail].kind === 'jail' &&
  BOARD[POS.freeParking].kind === 'freeParking' && BOARD[POS.goToJail].kind === 'goToJail');
check('non-card tile names unique',
  BOARD.filter((t) => t.kind !== 'card').length === new Set(BOARD.filter((t) => t.kind !== 'card').map((t) => t.name)).size);
check('20 cities', count('city') === 20, String(count('city')));
check('2 holy', HOLY_TILES.length === 2);
check('4 rail', RAIL_TILES.length === 4);
check('2 utility', UTILITY_TILES.length === 2);
check('2 tax', count('tax') === 2);
check('6 card tiles (3+3)', count('card') === 6 &&
  BOARD.filter((t) => t.kind === 'card' && t.deck === 'kismat').length === 3 &&
  BOARD.filter((t) => t.kind === 'card' && t.deck === 'khazana').length === 3);
check('color group sizes 3,3,3,3,3,3,2',
  Object.values(GROUP_TILES).map((g) => g.length).join(',') === '3,3,3,3,3,3,2',
  Object.entries(GROUP_TILES).map(([g, v]) => `${g}:${v.length}`).join(' '));

// ---- prices and rents ----
const total = BOARD.reduce((s, t) => s + (isOwnable(t) ? t.price : 0), 0);
check('board price total = 19,700', total === 19700, String(total));
check('all mortgage values whole rupees', BOARD.every((t) => !isOwnable(t) || Number.isInteger(mortgageValue(t.price))));
const cities = BOARD.filter((t): t is Extract<Tile, { kind: 'city' }> => t.kind === 'city');
check('city rent arrays: 6 values, strictly rising, multiples of 5',
  cities.every((c) => c.rent.length === 6 && c.rent.every((r, i) => (i === 0 || r > c.rent[i - 1]) && r % 5 === 0)));
check('base rent below price for every city', cities.every((c) => c.rent[0] < c.price));
check('house cost constant within a group',
  Object.values(GROUP_TILES).every((idxs) => new Set(idxs.map((i) => (BOARD[i] as { houseCost: number }).houseCost)).size === 1));
const rails = RAIL_TILES.map((i) => BOARD[i] as Extract<Tile, { kind: 'rail' }>);
check('rail rent [85,165,335,665]', rails.every((r) => r.rent.join() === '85,165,335,665'), rails[0].rent.join());
check('holy rent [100,300], price 600', HOLY_TILES.every((i) => {
  const t = BOARD[i] as Extract<Tile, { kind: 'holy' }>;
  return t.rent.join() === '100,300' && t.price === 600;
}));

// ---- cards ----
check('32 cards', CARDS.length === 32);
check('16 per deck', cardsOf('kismat').length === 16 && cardsOf('khazana').length === 16);
check('card ids unique', new Set(CARDS.map((c) => c.id)).size === CARDS.length);
check('exactly 1 jail-free per deck',
  (['kismat', 'khazana'] as const).every((d) => cardsOf(d).filter((c) => c.effect.type === 'jailFree').length === 1));
check('exactly 1 speed-limit card', CARDS.filter((c) => c.effect.type === 'speedLimit').length === 1);
check('moveTo targets inside board', CARDS.every((c) => c.effect.type !== 'moveTo' || (c.effect.tile >= 0 && c.effect.tile < 40)));
check('money amounts positive', CARDS.every((c) => {
  const e = c.effect;
  return !('amount' in e) || e.amount > 0;
}));
check('every card has a line', CARDS.every((c) => c.line.trim().length > 0));

// ---- economy snapshot (bank -> player per draw; ignores player-to-player and repairs) ----
for (const deck of ['kismat', 'khazana'] as const) {
  let net = 0;
  for (const c of cardsOf(deck)) {
    const e = c.effect;
    if (e.type === 'collect') net += e.amount;
    if (e.type === 'payPot') net -= e.amount;
    if (e.type === 'moveTo' && e.tile === POS.start) net += CONFIG.salary;
  }
  console.log(`INFO  ${deck}: avg net to player per draw = ${(net / 16).toFixed(1)} rupees`);
}
const dice = (mult: number): string => `avg ${7 * mult}, max ${12 * mult}`;
console.log(`INFO  utility rent (rupees): one owned ${dice(CONFIG.utilityMultiplier.one)}; both owned ${dice(CONFIG.utilityMultiplier.both)}`);
console.log(`INFO  rail rent: ${rails[0].rent.join(' / ')}`);
console.log(`INFO  Dehradun rent: ${(BOARD[6] as { rent: number[] }).rent.join(' / ')}`);
console.log(`INFO  Mumbai rent:   ${(BOARD[39] as { rent: number[] }).rent.join(' / ')}`);
console.log(`INFO  all-cash start, 3 players = ${3 * CONFIG.startCash}, 6 players = ${6 * CONFIG.startCash}, board = ${total}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
