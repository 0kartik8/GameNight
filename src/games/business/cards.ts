import { indexOfTile } from './board';
import type { DeckName } from './board';
import type { JokerKind } from './types';

// Effects:
// rollMove: the die is rolled when the card is drawn and shown to everyone. dir 1 = forward, -1 = back.
// joker: a hidden card. Only the holder can open it. When used, one of `used` lines is shown to everyone at random.
export type CardEffect =
  | { type: 'collect'; amount: number }
  | { type: 'payPot'; amount: number }
  | { type: 'payNowhere'; amount: number }
  | { type: 'moveTo'; tile: number }
  | { type: 'rollMove'; dir: 1 | -1 }
  | { type: 'goToJail' }
  | { type: 'jailFree' }
  | { type: 'joker'; kind: JokerKind; used: string[] }
  | { type: 'speedLimit' }
  | { type: 'payEachPlayer'; amount: number }
  | { type: 'collectFromEach'; amount: number }
  | { type: 'repairs'; perHouse: number; perHotel: number };

export interface Card {
  id: string;
  deck: DeckName;
  line: string; // shown on draw (for Jokers: a neutral line, the real kind stays hidden)
  effect: CardEffect;
}

const START = indexOfTile('Start');
const MUMBAI = indexOfTile('Mumbai');
const DELHI = indexOfTile('Delhi');

const HEIST_USED = ['Haath ki safai hai, samjha karo.', 'Apna maal samajh ke rakh raha hoon.', 'Don ko pakadna mushkil hi nahi, namumkin hai.', 'Aaj kuch toofani karte hain.', 'Chori karna mera pesha nahi, passion hai.'];
const UNO_USED = ['Aap chronology samajhiye.', 'Picture abhi baaki hai, mere dost.', 'Main apun ka favourite hoon re.', 'Keh ke lunga.', 'Tera game over, mera game on.'];
const BLOCK_USED = ['Lock kar diya jaaye.', 'System hang kar diya.', 'Access denied.', 'Yeh property ab sarkari hai.', 'Tumse na ho payega.'];
const JAIL_USED = ['Chacha vidhayak hain humare.', 'Bade bade deshon mein aisi chhoti chhoti baatein hoti rehti hain.', 'Jurm kiya hai toh darrna kya?', 'Setting hai boss.', 'Bail toh apna janamsiddh adhikaar hai.'];

const JOKER_LINE = 'Ek Joker mil gaya. Chhupa ke rakho, kisi ko mat batao.';

const k = (n: number, line: string, effect: CardEffect): Card => ({ id: `k${String(n).padStart(2, '0')}`, deck: 'kismat', line, effect });
const z = (n: number, line: string, effect: CardEffect): Card => ({ id: `z${String(n).padStart(2, '0')}`, deck: 'khazana', line, effect });

export const CARDS: readonly Card[] = [
  // ---- Kismat: luck, movement, jail, risk. 4 of 16 are Jokers. ----
  k(1, 'Gutter me gir gaye. Collect ₹200 from the content creator who posted it and went viral.', { type: 'collect', amount: 200 }),
  k(2, JOKER_LINE, { type: 'joker', kind: 'heist', used: HEIST_USED }),
  k(3, 'Helmet nahi pehna. Challan kat gaya.', { type: 'payPot', amount: 150 }),
  k(4, 'Mumbai local pakad li.', { type: 'moveTo', tile: MUMBAI }),
  k(5, 'Ghar wapsi. Advance to Start, collect salary.', { type: 'moveTo', tile: START }),
  k(6, 'Google Maps ne galat rasta bataya. Go back randomly between 1-6 tiles.', { type: 'rollMove', dir: -1 }),
  k(7, 'Detention. Protest me pakde gaye.', { type: 'goToJail' }),
  k(8, JOKER_LINE, { type: 'joker', kind: 'jail', used: JAIL_USED }),
  k(9, 'Traffic police ne speed limit laga di.', { type: 'speedLimit' }),
  k(10, 'IPL final ke tickets le liye.', { type: 'payPot', amount: 300 }),
  k(11, 'Dilli darshan ka mann hua. Challo Delhi.', { type: 'moveTo', tile: DELHI }),
  k(12, JOKER_LINE, { type: 'joker', kind: 'uno', used: UNO_USED }),
  k(13, 'Birthday party toh deni padegi.', { type: 'payEachPlayer', amount: 100 }),
  k(14, JOKER_LINE, { type: 'joker', kind: 'block', used: BLOCK_USED }),
  k(15, 'Phone haath se chhoota. Screen tooti aur baap ne petaa. Pay ₹300 for hospital bills.', { type: 'payNowhere', amount: 300 }),
  k(16, 'Auto wale ne shortcut le liya. Move forward randomly 1-6 tiles.', { type: 'rollMove', dir: 1 }),

  // ---- Khazana: everyday money, mostly bank ----
  z(1, 'Dare accept kiya aur jeet gaye.', { type: 'collect', amount: 250 }),
  z(2, 'Aaj tumhara birthday hai.', { type: 'collectFromEach', amount: 100 }),
  z(3, 'Road pe paise mile.', { type: 'collect', amount: 150 }),
  z(4, 'Bank ne galti se zyada paisa diya.', { type: 'collect', amount: 300 }),
  z(5, 'Doctor ki fees.', { type: 'payPot', amount: 150 }),
  z(6, 'School fees due hai.', { type: 'payPot', amount: 500 }),
  z(7, 'Tax refund aa gaya.', { type: 'collect', amount: 100 }),
  z(8, 'Dadi ki purani almari me paise mile.', { type: 'collect', amount: 350 }),
  z(9, 'Vakeel sahab ka jugaad.', { type: 'jailFree' }),
  z(10, 'Salary day.', { type: 'moveTo', tile: START }),
  z(11, 'Ghar ki marammat karwani padi.', { type: 'repairs', perHouse: 150, perHotel: 500 }),
  z(12, 'Dost ki shaadi me shagun dena pada.', { type: 'payPot', amount: 300 }),
  z(13, 'Dost se cricket ki shart jeet gaye.', { type: 'collect', amount: 300 }),
  z(14, 'AC chalaya. Bijli ka bill aaya.', { type: 'payPot', amount: 200 }),
  z(15, 'Purana phone OLX pe bik gaya.', { type: 'collect', amount: 200 }),
  z(16, 'Society ka Ganpati chanda.', { type: 'payPot', amount: 100 }),
];

export const cardsOf = (deck: DeckName): Card[] => CARDS.filter((c) => c.deck === deck);
export const cardById = (id: string): Card => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`No card "${id}"`);
  return c;
};
export const isJoker = (c: Card): boolean => c.effect.type === 'joker';
