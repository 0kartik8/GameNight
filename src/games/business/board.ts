import { CONFIG } from './config';

export type Group = 'lightBlue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'blue';
export type DeckName = 'kismat' | 'khazana';

// City rent order: [base, 1 house, 2 houses, 3 houses, 4 houses, hotel]
// Rail rent order: [1 owned, 2, 3, 4]
// Holy rent order: [1 owned, 2 owned]. Holy tiles take no buildings.
export type Tile =
  | { kind: 'toll'; name: string; price: number; base: number; rise: number }
  | { kind: 'market'; name: string }
  | { kind: 'start'; name: string }
  | { kind: 'city'; name: string; group: Group; price: number; houseCost: number; rent: number[] }
  | { kind: 'holy'; name: string; price: number; rent: number[] }
  | { kind: 'rail'; name: string; price: number; rent: number[] }
  | { kind: 'utility'; name: string; price: number }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'card'; name: string; deck: DeckName }
  | { kind: 'jail'; name: string }
  | { kind: 'freeParking'; name: string }
  | { kind: 'goToJail'; name: string };

// ---- rent scaling -------------------------------------------------------
const scale = (n: number): number => {
  const { factor, roundTo } = CONFIG.rentScale;
  return Math.round((n * factor) / roundTo) * roundTo;
};
const scaled = (xs: readonly number[]): number[] => xs.map(scale);

// Baseline rent tiers, scaled at load. One tier per price point.
const T1 = [6, 30, 90, 270, 400, 550];
const T2 = [8, 40, 100, 300, 450, 600];
const T3 = [10, 50, 150, 450, 625, 750];
const T4 = [12, 60, 180, 500, 700, 900];
const T5 = [14, 70, 200, 550, 750, 950];
const T6 = [16, 80, 220, 600, 800, 1000];
const T7 = [18, 90, 250, 700, 875, 1050];
const T8 = [20, 100, 300, 750, 925, 1100];
const T9 = [22, 110, 330, 800, 975, 1150];
const T10 = [24, 120, 360, 850, 1025, 1200];
const T11 = [26, 130, 390, 900, 1100, 1275];
const T12 = [28, 150, 450, 1000, 1200, 1400];
const T13 = [35, 175, 500, 1100, 1300, 1500];
const T14 = [50, 200, 600, 1400, 1700, 2000];

const HOUSE_COST: Record<Group, number> = {
  lightBlue: 150,
  pink: 350,
  orange: 350,
  red: 500,
  yellow: 500,
  green: 650,
  blue: 650,
};

// ---- tile builders ------------------------------------------------------
const city = (name: string, group: Group, price: number, baseRent: readonly number[]): Tile => ({
  kind: 'city',
  name,
  group,
  price,
  houseCost: HOUSE_COST[group],
  rent: scaled(baseRent),
});
const holy = (name: string): Tile => ({ kind: 'holy', name, price: 600, rent: [...CONFIG.holyRent] });
const rail = (name: string): Tile => ({ kind: 'rail', name, price: 650, rent: scaled([25, 50, 100, 200]) });
const utility = (name: string): Tile => ({ kind: 'utility', name, price: 500 });
const kismat = (): Tile => ({ kind: 'card', name: 'Kismat', deck: 'kismat' });
const khazana = (): Tile => ({ kind: 'card', name: 'Khazana', deck: 'khazana' });

// ---- the board: index = position, clockwise from Start ------------------
export const BOARD: readonly Tile[] = [
  { kind: 'start', name: 'Start' }, // 0
  holy('Haridwar'), // 1
  khazana(), // 2
  holy('Rishikesh'), // 3
  { kind: 'tax', name: 'Income Tax', amount: CONFIG.incomeTax }, // 4
  rail('Howrah Junction'), // 5
  city('Dehradun', 'lightBlue', 350, T1), // 6
  kismat(), // 7
  city('Shimla', 'lightBlue', 350, T1), // 8
  city('Amritsar', 'lightBlue', 400, T2), // 9
  { kind: 'jail', name: 'Jail' }, // 10
  city('Ludhiana', 'pink', 450, T3), // 11
  utility('Power Grid'), // 12
  city('Bhopal', 'pink', 450, T3), // 13
  city('Indore', 'pink', 550, T4), // 14
  rail('Chennai Central'), // 15
  city('Patna', 'orange', 600, T5), // 16
  khazana(), // 17
  city('Lucknow', 'orange', 600, T5), // 18
  city('Kochi', 'orange', 650, T6), // 19
  { kind: 'freeParking', name: 'Free Parking' }, // 20
  { kind: 'toll', name: 'Sarkari Toll', price: CONFIG.toll.price, base: CONFIG.toll.base, rise: CONFIG.toll.rise }, // 21
  kismat(), // 22
  city('Chandigarh', 'red', 750, T7), // 23
  city('Surat', 'red', 800, T8), // 24
  rail('Mumbai CSMT'), // 25
  city('Jaipur', 'yellow', 850, T9), // 26
  city('Pune', 'yellow', 850, T9), // 27
  utility('Jal Board'), // 28
  city('Hyderabad', 'yellow', 950, T10), // 29
  { kind: 'goToJail', name: 'Go to Jail' }, // 30
  city('Kolkata', 'green', 1000, T11), // 31
  city('Chennai', 'green', 1000, T11), // 32
  khazana(), // 33
  city('Bengaluru', 'green', 1050, T12), // 34
  rail('New Delhi Station'), // 35
  kismat(), // 36
  city('Delhi', 'blue', 1150, T13), // 37
  { kind: 'market', name: 'Stock Market' }, // 38
  city('Mumbai', 'blue', 1350, T14), // 39
];

// ---- lookups ------------------------------------------------------------
export const indexOfTile = (name: string): number => {
  const i = BOARD.findIndex((t) => t.name === name);
  if (i < 0) throw new Error(`No tile named "${name}"`);
  return i;
};

export const POS = { start: 0, jail: 10, freeParking: 20, goToJail: 30 } as const;

const indicesOfKind = (kind: Tile['kind']): number[] =>
  BOARD.flatMap((t, i) => (t.kind === kind ? [i] : []));

export const HOLY_TILES = indicesOfKind('holy');
export const RAIL_TILES = indicesOfKind('rail');
export const UTILITY_TILES = indicesOfKind('utility');

export const GROUP_TILES: Record<Group, number[]> = {
  lightBlue: [],
  pink: [],
  orange: [],
  red: [],
  yellow: [],
  green: [],
  blue: [],
};
BOARD.forEach((t, i) => {
  if (t.kind === 'city') GROUP_TILES[t.group].push(i);
});

export const isOwnable = (t: Tile): t is Extract<Tile, { price: number }> =>
  t.kind === 'city' || t.kind === 'holy' || t.kind === 'rail' || t.kind === 'utility' || t.kind === 'toll';

export const mortgageValue = (price: number): number => price * CONFIG.mortgageRate;
