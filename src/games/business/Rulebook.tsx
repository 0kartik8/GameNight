import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { BOARD, HOLY_TILES, RAIL_TILES, UTILITY_TILES } from './board';
import { CONFIG } from './config';
import Overlay from './Overlay';
import { inr } from './view';

// Every number below is read from config.ts or board.ts, so the rulebook never goes stale.
const price = (i: number): number => {
  const t = BOARD[i];
  return 'price' in t ? t.price : 0;
};
const pct = (x: number): string => `${Math.round(x * 100)}%`;

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl bg-white/5 p-4 open:bg-white/10">
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-white">
        {title}
        <ChevronDown className="size-5 text-white/60 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-white/85">{children}</ul>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 px-3 py-2">
      <div className="text-xs text-white/55">{label}</div>
      <div className="font-display text-lg font-extrabold text-amber">{value}</div>
    </div>
  );
}

export default function Rulebook({ onClose }: { onClose: () => void }) {
  const holy = price(HOLY_TILES[0]);
  const rail = price(RAIL_TILES[0]);
  const util = price(UTILITY_TILES[0]);
  const raise = CONFIG.auction.raiseButtons;
  return (
    <Overlay title="Rulebook" onClose={onClose} wide>
      <p className="mb-4 text-white/70">Tap any tile on the board to see its price, rent, and owner. Opening or closing the rulebook never changes the game.</p>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Start cash" value={inr(CONFIG.startCash)} />
        <Stat label="Salary at Start" value={inr(CONFIG.salary)} />
        <Stat label="Income Tax" value={inr(CONFIG.incomeTax)} />
        <Stat label="GST" value={inr(CONFIG.gst)} />
        <Stat label="Jail fine" value={inr(CONFIG.jailFine)} />
        <Stat label="Holy donation" value={inr(CONFIG.holy.donation)} />
        <Stat label="Mortgage pays" value={pct(CONFIG.mortgageRate)} />
        <Stat label="Players" value={`${CONFIG.players.min} to ${CONFIG.players.max}`} />
      </div>

      <div className="space-y-2">
        <Section title="Setup" defaultOpen>
          <li>
            {CONFIG.players.min} to {CONFIG.players.max} players share one screen. Each starts with {inr(CONFIG.startCash)}.
          </li>
          <li>Everyone rolls once. The highest total goes first, and play moves clockwise from there. Ties roll again.</li>
          <li>The host picks how the game ends: last player standing, or a fixed number of rounds ({CONFIG.roundOptions.join(', ')}).</li>
        </Section>

        <Section title="Your turn" defaultOpen>
          <li>Roll two dice and move clockwise. Then follow the tile you land on.</li>
          <li>Doubles: roll again after your tile is done. Roll doubles {CONFIG.maxDoublesBeforeJail} times in a row and you go to Jail without moving.</li>
          <li>On your turn, before or after rolling, you can build, mortgage, and trade. Tap Properties or Trade.</li>
          <li>Pass or land on Start: collect {inr(CONFIG.salary)}.</li>
        </Section>

        <Section title="Buying and auctions">
          <li>Land on an unowned property and you may buy it at the price shown.</li>
          <li>If you decline, or cannot afford it, everyone bids for it, including you. The player after you bids first.</li>
          <li>
            Opening bid is {inr(CONFIG.auction.openingBid)}. Each raise is at least {inr(raise[0])}. The bid buttons raise by {raise.map(inr).join(', ')}. Nobody can bid more cash than they have.
          </li>
          <li>Highest bid wins and pays. If everyone passes, the tile stays unowned.</li>
        </Section>

        <Section title="Rent">
          <li>Land on a tile owned by another player and you pay them rent. Mortgaged tiles collect no rent.</li>
          <li>Cities: rent rises with houses. Own the full color set with no buildings and the base rent doubles.</li>
          <li>Railway stations ({inr(rail)} each): rent depends on how many stations the owner has.</li>
          <li>
            Utilities ({inr(util)} each): rent is your dice total × {CONFIG.utilityMultiplier.one} if the owner has one, × {CONFIG.utilityMultiplier.both} if they have both.
          </li>
          <li>
            Holy cities, Haridwar and Rishikesh ({inr(holy)} each): rent is {inr(CONFIG.holyRent[0])}, or {inr(CONFIG.holyRent[1])} when one player owns both. They take no houses. See the next section for donations.
          </li>
        </Section>

        <Section title="Holy cities and corruption">
          <li>
            Every landing on a holy city costs a {inr(CONFIG.holy.donation)} donation. That includes the owner, and it applies whether the city is owned or not. A visitor pays rent as well.
          </li>
          <li>The donation goes to the poorest other player by cash. A tie goes to the one whose properties have the lower total mortgage value. If that also ties, it goes into the Free Parking pot.</li>
          <li>
            Each city counts its own donations. After {CONFIG.holy.corruptAfter} it is corrupted for good. The third landing is still charged as a holy city.
          </li>
          <li>The {inr(CONFIG.holyRent[1])} pair rent only works when both cities are in the same state. Once one city corrupts, a holy city and a corrupted city pay {inr(CONFIG.holyRent[0])} each.</li>
          <li>
            A corrupted city takes no more donations. Visitors pay rent plus a bribe to the owner: {inr(CONFIG.holy.bribe[0])} while one city is corrupted, {inr(CONFIG.holy.bribe[1])} once both are. The owner pays nothing when landing there.
          </li>
          <li>Two corrupted cities owned by one player pay {inr(CONFIG.holyRent[1])} rent, plus the bribe. A mortgaged corrupted city collects nothing, bribe included.</li>
        </Section>

        <Section title="Building">
          <li>You need every city in a color set, and none of them mortgaged.</li>
          <li>Build evenly: no tile may get a second house until every tile in the set has one.</li>
          <li>Each house costs the same for the whole set. A hotel is a fifth building: 4 houses plus one more purchase.</li>
          <li>
            The bank has {CONFIG.supply.houses} houses and {CONFIG.supply.hotels} hotels. When they run out, nobody can build.
          </li>
          <li>You can sell a building back to the bank for {pct(CONFIG.buildingSellRate)} of its cost. Sell evenly too. Selling a hotel gives you 4 houses back, so the bank needs 4 houses in stock.</li>
        </Section>

        <Section title="Mortgage">
          <li>Mortgage a property to get {pct(CONFIG.mortgageRate)} of its price from the bank. No rent is collected while it is mortgaged.</li>
          <li>You cannot mortgage a city if any tile in its color set has buildings. Sell the buildings first.</li>
          <li>To unmortgage, pay the mortgage value plus {pct(CONFIG.unmortgageInterest)}, rounded up.</li>
        </Section>

        <Section title="Jail">
          <li>You go to Jail from the Go to Jail tile, from rolling doubles {CONFIG.maxDoublesBeforeJail} times, or from some cards. You do not collect salary.</li>
          <li>To get out, do one of these on your turn: pay {inr(CONFIG.jailFine)}, use a Get out of Jail card, or roll doubles. Doubles move you out by that roll, but give no extra turn.</li>
          <li>Fail to roll doubles {CONFIG.jailMaxTurns} turns in a row and you pay {inr(CONFIG.jailFine)} and move by your third roll.</li>
          <li>You still collect rent while you are in Jail. Landing on Jail by dice is just a visit.</li>
        </Section>

        <Section title="Free Parking">
          <li>Income Tax, GST, and card fines go into the Free Parking pot. It starts at {inr(0)}.</li>
          <li>Land on Free Parking and take the whole pot.</li>
          <li>Jail fines and repair bills go to the bank, not the pot.</li>
        </Section>

        <Section title="Kismat and Khazana cards">
          <li>Land on a Kismat or Khazana tile, draw the top card, and do what it says. Kismat is luck, with moves, fines, and Jail. Khazana is everyday money.</li>
          <li>Moving forward past Start pays salary. Moving back does not. A move can land you on another card tile or on a property you must pay for.</li>
          <li>A Get out of Jail card is kept until used. You can trade it.</li>
          <li>Speed limit: your next roll over {CONFIG.speedLimitMaxRoll} sends you straight to Jail. It lasts for one roll.</li>
        </Section>

        <Section title="Trading">
          <li>Only the player on turn can propose a trade. Pick a partner, then choose cash, properties, and Get out of Jail cards on each side.</li>
          <li>You cannot trade a tile whose color set has buildings. Sell the buildings first.</li>
          <li>A mortgaged tile can be traded and stays mortgaged. Whoever receives it pays the bank {pct(CONFIG.tradeMortgagedFee)} of its mortgage value, rounded up.</li>
          <li>The other player taps Accept or Decline. Nothing else can happen until they answer.</li>
        </Section>

        <Section title="Running out of money">
          <li>If you owe more than you have, sell buildings and mortgage property to raise cash, then pay.</li>
          <li>If you cannot or will not, declare bankruptcy and you are out.</li>
          <li>Your buildings go back to the bank at half cost. If you owed another player, they take your cash and properties, and mortgaged tiles stay mortgaged.</li>
          <li>If you owed the bank or the pot, your properties are cleared of mortgages and auctioned one by one.</li>
        </Section>

        <Section title="How the game ends">
          <li>Last player standing: the game ends when everyone else is bankrupt.</li>
          <li>Fixed rounds: a round is one turn for every player. Extra rolls from doubles do not count. After the last round, the richest player wins.</li>
          <li>Net worth is cash, plus property prices (mortgaged properties count half), plus what was paid for buildings. A tie goes to the player with more cash.</li>
        </Section>
      </div>
    </Overlay>
  );
}
