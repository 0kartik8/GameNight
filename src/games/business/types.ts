import type { DeckName } from './board';
import type { RoundOption } from './config';

export type PlayerId = string;

export type WinCondition = { mode: 'lastStanding' } | { mode: 'rounds'; rounds: RoundOption };

export interface Player {
  id: PlayerId;
  name: string;
  token: string; // emoji
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number; // failed escape turns so far
  jailFreeCards: DeckName[]; // remembers which deck to return the card to
  speedLimit: boolean; // next movement roll total above limit sends to jail
  doublesInRow: number;
  bankrupt: boolean;
}

// houses: 0-4 houses, 5 = hotel. Only ownable tiles have an entry.
export interface PropertyState {
  owner: PlayerId | null;
  mortgaged: boolean;
  houses: number;
  donations: number; // holy cities only: donations received so far. Corrupted once it reaches the limit.
}

// drawPile[0] = top. Drawn card goes to bottom. Held jail-free cards leave the pile until used.
export interface DeckState {
  drawPile: string[];
}

export type Payee = { kind: 'bank' } | { kind: 'pot' } | { kind: 'player'; id: PlayerId };

export interface Debt {
  debtor: PlayerId;
  payee: Payee;
  amount: number;
  reason: string;
  kind: EventKind; // log icon/category when paid
  holyTile?: number; // a holy-city donation: count it on this tile once paid
}

export interface AuctionState {
  tile: number;
  highBid: number;
  highBidder: PlayerId | null;
  inAuction: PlayerId[]; // players who have not passed
  toAct: PlayerId; // whose turn to bid or pass, clockwise
}

export interface TradeSide {
  cash: number;
  tiles: number[]; // no buildings allowed on these
  jailFree: DeckName[];
}
export interface TradeOffer {
  from: PlayerId;
  to: PlayerId;
  give: TradeSide; // from -> to
  get: TradeSide; // to -> from
}

export type Phase =
  | { t: 'turnStart' } // build, mortgage, trade, then ROLL. In jail: jail options too.
  | { t: 'buyOrAuction'; tile: number }
  | { t: 'auction'; auction: AuctionState }
  | { t: 'cardShown'; cardId: string } // UI shows card, ACK_CARD applies it
  | { t: 'debt'; debt: Debt } // raise cash, then PAY_DEBT, or DECLARE_BANKRUPTCY
  | { t: 'turnEnd'; rollAgain: boolean } // after resolution. rollAgain = rolled doubles
  | { t: 'gameOver'; winner: PlayerId; reason: 'lastStanding' | 'netWorth' };

export type EventKind =
  | 'roll' | 'move' | 'salary' | 'buy' | 'rent' | 'tax' | 'card' | 'jail' | 'jailExit'
  | 'auction' | 'build' | 'sell' | 'mortgage' | 'trade' | 'pot' | 'donate' | 'corrupt'
  | 'bankrupt' | 'round' | 'win';

export interface LogEntry {
  seq: number;
  kind: EventKind;
  player?: PlayerId;
  tile?: number;
  amount?: number;
  text: string; // English, shown in the event log
}

export interface GameState {
  version: 1;
  rngState: number; // deterministic PRNG state. Same state + action = same result
  players: Player[]; // seating = turn order
  current: number; // index into players
  round: number; // 1-based. Bonus doubles rolls do not advance it
  win: WinCondition;
  properties: Record<number, PropertyState>;
  houseStock: number;
  hotelStock: number;
  decks: Record<DeckName, DeckState>;
  pot: number; // Free Parking jackpot
  phase: Phase;
  lastRoll: [number, number] | null;
  pendingTrade: TradeOffer | null;
  debtQueue: Debt[]; // debts waiting to be paid, in order
  pendingMove: number | null; // dice steps to move once a jail fine is settled
  pendingBuy: number | null; // unowned tile to offer for sale once any debts are cleared
  pendingAuctions: number[]; // bankruptcy assets still to auction, one after another
  log: LogEntry[];
}

export type Action =
  | { type: 'START_GAME'; players: { name: string; token: string }[]; win: WinCondition; seed: number }
  | { type: 'ROLL' }
  | { type: 'JAIL_PAY' }
  | { type: 'JAIL_USE_CARD' }
  | { type: 'BUY' }
  | { type: 'DECLINE_BUY' } // starts auction
  | { type: 'AUCTION_BID'; player: PlayerId; amount: number }
  | { type: 'AUCTION_PASS'; player: PlayerId }
  | { type: 'ACK_CARD' }
  | { type: 'BUILD'; tile: number }
  | { type: 'SELL_BUILDING'; tile: number }
  | { type: 'MORTGAGE'; tile: number }
  | { type: 'UNMORTGAGE'; tile: number }
  | { type: 'TRADE_PROPOSE'; offer: TradeOffer }
  | { type: 'TRADE_ACCEPT' }
  | { type: 'TRADE_DECLINE' }
  | { type: 'PAY_DEBT' }
  | { type: 'DECLARE_BANKRUPTCY' }
  | { type: 'END_TURN' };
