// All tunable numbers live here. Rulebook and engine read from this file only.
// Change a number here, nothing else needs editing.

export const CONFIG = {
  players: { min: 3, max: 6 },

  startCash: 5000,
  salary: 300, // pass or land on Start
  incomeTax: 300,
  gst: 150,

  jailFine: 150,
  jailMaxTurns: 3,
  maxDoublesBeforeJail: 3,

  mortgageRate: 0.5, // of price
  unmortgageInterest: 0.1, // added on top of mortgage value
  tradeMortgagedFee: 0.1, // receiver pays on receipt of mortgaged tile
  buildingSellRate: 0.5, // of building cost, sold back to bank

  supply: { houses: 32, hotels: 12 },

  auction: {
    openingBid: 10,
    raiseButtons: [10, 50, 100], // smallest value is the minimum raise
  },

  // Holy cities: every landing costs a donation. A city that takes enough donations turns corrupted for good.
  holy: {
    donation: 50, // paid by whoever lands, owner included, to the poorest other player
    corruptAfter: 3, // donations one city takes before it corrupts
    bribe: [50, 100], // visitors to a corrupted city pay this to its owner: [one city corrupted, both corrupted]
  },
  holyRent: [100, 300], // owning 1 holy tile, owning both

  speedLimitMaxRoll: 9, // next roll total above this sends player to jail

  // Utility rent = dice total x multiplier (rupees per pip)
  utilityMultiplier: { one: 5, both: 20 },

  // Rents are baseline numbers scaled to this economy
  rentScale: { factor: 10 / 3, roundTo: 5 },

  roundOptions: [5, 10, 15, 20, 30],
  deckSize: 16,

  // Sarkari Toll: its rent rises by `rise` every round, starting at `base`.
  toll: { price: 550, base: 30, rise: 20 },
  // Stock Market: landing gives the rent-received multiplier for the next `rounds` rounds.
  market: { multipliers: [0.5, 1, 2], rounds: 2 },
  // Heist: most money one Heist can take.
  heistCap: 300,
  // Block seal: how many turns (every player's turn-end) the rent stays at 0.
  blockTurns: 2,
  // Selling a property back to the bank pays this share of its price, rounded to 5.
  sellRate: 0.75,
} as const;

export type RoundOption = (typeof CONFIG.roundOptions)[number];
