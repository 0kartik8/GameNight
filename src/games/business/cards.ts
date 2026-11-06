import { indexOfTile } from './board';
import type { DeckName } from './board';

// moveTo: always moves forward. Passing or landing on Start pays salary.
// moveBy: negative = back, no salary. Positive wraps and pays salary if it passes Start.
// payPot: fine goes to the Free Parking pot.
// repairs: paid to bank, not pot.
export type CardEffect =
  | { type: 'collect'; amount: number }
  | { type: 'payPot'; amount: number }
  | { type: 'moveTo'; tile: number }
  | { type: 'moveBy'; steps: number }
  | { type: 'goToJail' }
  | { type: 'jailFree' }
  | { type: 'speedLimit' }
  | { type: 'payEachPlayer'; amount: number }
  | { type: 'collectFromEach'; amount: number }
  | { type: 'repairs'; perHouse: number; perHotel: number };

export interface Card {
  id: string;
  deck: DeckName;
  line: string; // Hinglish flavor text shown on draw
  effect: CardEffect;
}

const START = indexOfTile('Start');
const MUMBAI = indexOfTile('Mumbai');
const DELHI = indexOfTile('Delhi');

const k = (n: number, line: string, effect: CardEffect): Card => ({
  id: `k${String(n).padStart(2, '0')}`,
  deck: 'kismat',
  line,
  effect,
});
const z = (n: number, line: string, effect: CardEffect): Card => ({
  id: `z${String(n).padStart(2, '0')}`,
  deck: 'khazana',
  line,
  effect,
});

export const CARDS: readonly Card[] = [
  // ---- Kismat: luck, movement, jail, risk ----
  k(1, 'Gutter me gir gaye. Municipality ne muaavza diya.', { type: 'collect', amount: 200 }),
  k(2, 'Boss ne Diwali bonus diya.', { type: 'collect', amount: 500 }),
  k(3, 'Helmet nahi pehna. Challan kat gaya.', { type: 'payPot', amount: 150 }),
  k(4, 'Mumbai local pakad li.', { type: 'moveTo', tile: MUMBAI }),
  k(5, 'Ghar wapsi. Salary day.', { type: 'moveTo', tile: START }),
  k(6, 'Google Maps ne galat rasta bataya.', { type: 'moveBy', steps: -3 }),
  k(7, 'Detention. Protest me pakde gaye.', { type: 'goToJail' }),
  k(8, 'Mama ji police me hain.', { type: 'jailFree' }),
  k(9, 'Traffic police ne speed limit laga di.', { type: 'speedLimit' }),
  k(10, 'IPL final ke tickets le liye.', { type: 'payPot', amount: 300 }),
  k(11, 'Dilli darshan ka mann hua.', { type: 'moveTo', tile: DELHI }),
  k(12, 'Dream11 me team jeet gayi.', { type: 'collect', amount: 400 }),
  k(13, 'Sabko chai-samosa party deni padi.', { type: 'payEachPlayer', amount: 100 }),
  k(14, 'Golgappe wale ne extra paani diya.', { type: 'collect', amount: 100 }),
  k(15, 'Phone haath se chhoota. Screen tooti.', { type: 'payPot', amount: 250 }),
  k(16, 'Auto wale ne shortcut le liya.', { type: 'moveBy', steps: 3 }),

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
