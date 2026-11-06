import { BOARD } from './board';
import type { Group, Tile } from './board';
import type { CardEffect } from './cards';
import { CONFIG } from './config';
import { bribeNow, isCorrupted } from './engine';
import type { GameState, Player } from './types';

export const GROUP_COLOR: Record<Group, string> = {
  lightBlue: '#7dd3fc',
  pink: '#f472b6',
  orange: '#fb923c',
  red: '#ef4444',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
};
export const GROUP_LABEL: Record<Group, string> = {
  lightBlue: 'Light blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
};
export const HOLY_COLOR = '#ff9933';
export const CORRUPT_COLOR = '#7f1d1d';
export const NEUTRAL_COLOR = '#94a3b8'; // rail, utility

export const PLAYER_COLORS = ['#8b5cf6', '#ff4d8d', '#b6f23a', '#ffb627', '#22d3ee', '#fb923c'];
export const TOKENS = ['🛺', '🏏', '☕', '🪁', '🐅', '🪔'];

export const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;
export const colorOf = (p: Pick<Player, 'id'>): string => PLAYER_COLORS[(Number(p.id.slice(1)) - 1) % PLAYER_COLORS.length];

export function bandColor(t: Tile): string | null {
  if (t.kind === 'city') return GROUP_COLOR[t.group];
  if (t.kind === 'holy') return HOLY_COLOR;
  if (t.kind === 'rail' || t.kind === 'utility') return NEUTRAL_COLOR;
  return null;
}

/** Band color of a tile right now. A corrupted holy city turns dark red. */
export const tileBand = (s: GameState, i: number): string | null => (isCorrupted(s, i) ? CORRUPT_COLOR : bandColor(BOARD[i]));

export type Side = 'bottom' | 'top' | 'left' | 'right' | 'corner';

/** Grid cell of a tile on the 11x11 board. Start is bottom-right, play runs clockwise. */
export function cell(i: number): { row: number; col: number; side: Side } {
  if (i === 0) return { row: 11, col: 11, side: 'corner' };
  if (i < 10) return { row: 11, col: 11 - i, side: 'bottom' };
  if (i === 10) return { row: 11, col: 1, side: 'corner' };
  if (i < 20) return { row: 21 - i, col: 1, side: 'left' };
  if (i === 20) return { row: 1, col: 1, side: 'corner' };
  if (i < 30) return { row: 1, col: i - 19, side: 'top' };
  if (i === 30) return { row: 1, col: 11, side: 'corner' };
  return { row: i - 29, col: 11, side: 'right' };
}

export const TILE_ICON: Partial<Record<Tile['kind'], string>> = {
  start: '🏁',
  jail: '⛓️',
  freeParking: '🅿️',
  goToJail: '👮',
  tax: '🧾',
  rail: '🚆',
  holy: '🛕',
};

export function describeEffect(e: CardEffect): string {
  switch (e.type) {
    case 'collect':
      return `Collect ${inr(e.amount)} from the bank`;
    case 'payPot':
      return `Pay ${inr(e.amount)} into the Free Parking pot`;
    case 'moveTo':
      return e.tile === 0 ? `Go to Start and collect ${inr(CONFIG.salary)}` : `Advance to ${BOARD[e.tile].name}. Pay rent if it is owned`;
    case 'moveBy':
      return e.steps < 0 ? `Go back ${-e.steps} tiles` : `Move forward ${e.steps} tiles`;
    case 'goToJail':
      return 'Go straight to Jail';
    case 'jailFree':
      return 'Keep this card. Use it to leave Jail for free';
    case 'speedLimit':
      return `Your next roll over ${CONFIG.speedLimitMaxRoll} sends you to Jail`;
    case 'payEachPlayer':
      return `Pay ${inr(e.amount)} to each player`;
    case 'collectFromEach':
      return `Collect ${inr(e.amount)} from each player`;
    case 'repairs':
      return `Pay ${inr(e.perHouse)} per house and ${inr(e.perHotel)} per hotel`;
  }
}

/** Rows shown on a property deed: label and value. */
export function deedRows(t: Tile, s?: GameState, tile?: number): [string, string][] {
  switch (t.kind) {
    case 'city':
      return [
        ['Rent', inr(t.rent[0])],
        ['With full color set', inr(t.rent[0] * 2)],
        ['1 house', inr(t.rent[1])],
        ['2 houses', inr(t.rent[2])],
        ['3 houses', inr(t.rent[3])],
        ['4 houses', inr(t.rent[4])],
        ['Hotel', inr(t.rent[5])],
        ['Each house or hotel costs', inr(t.houseCost)],
      ];
    case 'holy': {
      const now = s !== undefined && tile !== undefined ? s : undefined;
      if (now && tile !== undefined && isCorrupted(now, tile)) {
        return [
          ['Rent with 1 corrupted city', inr(t.rent[0])],
          ['Rent with both corrupted', inr(t.rent[1])],
          ['Bribe from visitors, to the owner', inr(bribeNow(now))],
          ['Owner pays here', 'nothing'],
        ];
      }
      return [
        ['Rent with 1 holy city', inr(t.rent[0])],
        ['Rent with both holy', inr(t.rent[1])],
        ['Donation on every landing', inr(CONFIG.holy.donation)],
        [`Donations so far`, now && tile !== undefined ? `${now.properties[tile].donations} of ${CONFIG.holy.corruptAfter}` : `corrupts after ${CONFIG.holy.corruptAfter}`],
      ];
    }
    case 'rail':
      return t.rent.map((r, i): [string, string] => [`${i + 1} station${i ? 's' : ''} owned`, inr(r)]);
    case 'utility':
      return [
        ['Rent with 1 utility', `Dice × ${CONFIG.utilityMultiplier.one}`],
        ['Rent with both', `Dice × ${CONFIG.utilityMultiplier.both}`],
      ];
    default:
      return [];
  }
}
