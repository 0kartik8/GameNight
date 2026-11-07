import type { DeckName } from './board';
import type { RoundOption } from './config';

export type PlayerId = string;

export type WinCondition = { mode: 'lastStanding' } | { mode: 'rounds'; rounds: RoundOption };

/** Kinds of hidden Joker cards. The real kind is only shown to the holder. */
export type JokerKind = 'heist' | 'uno' | 'block' | 'jail';

export interface PlayerStats {
  rentIn: number;
  rentOut: number;
  bribeIn: number;
  donationsOut: number;
  jailed: number;
  auctionsWon: number;
  corrupted: number; // holy cities this player owned that corrupted
  jokers: Record<JokerKind, number>;
}

export interface Player {
  id: PlayerId;
  name: string;
  token: string; // emoji
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailFreeCards: DeckName[]; // plain Get-out-of-Jail cards (Khazana)
  speedLimit: boolean;
  doublesInRow: number;
  bankrupt: boolean;
  jokers: string[]; // card ids of held Jokers. The kind is hidden until the holder opens it.
  market: { mult: number; from: number; until: number } | null; // Stock Market effect on rent received
  heistOwed: { thief: PlayerId; amount: number } | null; // money a Heist took, which Uno Reverse can return
  stats: PlayerStats;
}

export interface PropertyState {
  owner: PlayerId | null;
  mortgaged: boolean;
  houses: number;
  donations: number; // holy cities: paid donations so far
  raises: number; // Sarkari Toll: how many rounds its rent has risen
  blockedUntil: number; // Block seal: rent is 0 while game turns < this
}

export interface DeckState {
  drawPile: string[];
}

export type Payee = { kind: 'bank' } | { kind: 'pot' } | { kind: 'nowhere' } | { kind: 'player'; id: PlayerId };

export interface Debt {
  debtor: PlayerId;
  payee: Payee;
  amount: number;
  reason: string;
  kind: EventKind;
  holyTile?: number;
  offered?: boolean; // Uno Reverse was already offered for this charge
}

export interface AuctionState {
  tile: number;
  highBid: number;
  highBidder: PlayerId | null;
  inAuction: PlayerId[];
  toAct: PlayerId;
  seller?: PlayerId | null; // set when an owner auctions their own property; the money goes to them
}

export interface TradeSide {
  cash: number;
  tiles: number[];
  jailFree: DeckName[];
}
export interface TradeOffer {
  from: PlayerId;
  to: PlayerId;
  give: TradeSide;
  get: TradeSide;
}

export type Phase =
  | { t: 'turnStart' }
  | { t: 'buyOrAuction'; tile: number }
  | { t: 'auction'; auction: AuctionState }
  | { t: 'cardShown'; cardId: string; roll?: number }
  | { t: 'debt'; debt: Debt }
  | { t: 'chance'; debt: Debt } // the player can use Uno Reverse on this charge, or pay it
  | { t: 'turnEnd'; rollAgain: boolean }
  | { t: 'gameOver'; winner: PlayerId; reason: 'lastStanding' | 'netWorth' };

export type EventKind =
  | 'roll' | 'move' | 'salary' | 'buy' | 'rent' | 'bribe' | 'tax' | 'card' | 'jail' | 'jailExit'
  | 'auction' | 'build' | 'sell' | 'mortgage' | 'trade' | 'pot' | 'donate' | 'corrupt'
  | 'bankrupt' | 'round' | 'win' | 'joker' | 'heist' | 'uno' | 'block' | 'market' | 'toll' | 'vote';

export interface LogEntry {
  seq: number;
  kind: EventKind;
  player?: PlayerId;
  tile?: number;
  amount?: number;
  text: string;
}

export interface GameState {
  version: 1;
  rngState: number;
  players: Player[];
  current: number;
  round: number;
  turns: number; // every END_TURN counts one, used by Block
  win: WinCondition;
  properties: Record<number, PropertyState>;
  houseStock: number;
  hotelStock: number;
  decks: Record<DeckName, DeckState>;
  pot: number;
  phase: Phase;
  lastRoll: [number, number] | null;
  pendingTrade: TradeOffer | null;
  debtQueue: Debt[];
  pendingMove: number | null;
  pendingBuy: number | null;
  pendingAuctions: number[];
  resumePhase: Phase | null; // where to go back to after a debt or auction started mid-turn
  endVotes: PlayerId[]; // players who voted to end the game early
  endPending: boolean; // true once a majority has voted; the game ends at the next END_TURN
  log: LogEntry[];
}

export type Action =
  | { type: 'START_GAME'; players: { name: string; token: string }[]; win: WinCondition; seed: number }
  | { type: 'ROLL' }
  | { type: 'JAIL_PAY' }
  | { type: 'JAIL_USE_CARD' }
  | { type: 'USE_JOKER'; joker: string; target?: PlayerId; tile?: number; mode?: 'heist' | 'market' }
  | { type: 'BUY' }
  | { type: 'DECLINE_BUY' }
  | { type: 'AUCTION_BID'; player: PlayerId; amount: number }
  | { type: 'AUCTION_PASS'; player: PlayerId }
  | { type: 'AUCTION_OWN'; tile: number }
  | { type: 'ACK_CARD' }
  | { type: 'BUILD'; tile: number }
  | { type: 'SELL_BUILDING'; tile: number }
  | { type: 'SELL_TO_BANK'; tile: number }
  | { type: 'MORTGAGE'; tile: number }
  | { type: 'UNMORTGAGE'; tile: number }
  | { type: 'TRADE_PROPOSE'; offer: TradeOffer }
  | { type: 'TRADE_ACCEPT' }
  | { type: 'TRADE_DECLINE' }
  | { type: 'PAY_DEBT' }
  | { type: 'DECLARE_BANKRUPTCY' }
  | { type: 'VOTE_END'; player: PlayerId }
  | { type: 'END_TURN' };
