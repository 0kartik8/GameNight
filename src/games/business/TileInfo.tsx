import type { ReactNode } from 'react';
import { BOARD, GROUP_TILES, HOLY_TILES, RAIL_TILES, UTILITY_TILES } from './board';
import { CONFIG } from './config';
import Deed from './Deed';
import { bribeNow, isCorrupted, rentFor } from './engine';
import Overlay from './Overlay';
import type { GameState } from './types';
import { colorOf, GROUP_LABEL, inr } from './view';

function plain(s: GameState, i: number): string {
  const t = BOARD[i];
  switch (t.kind) {
    case 'start':
      return `Pass or land here to collect ${inr(CONFIG.salary)} salary.`;
    case 'jail':
      return `Landing here is safe: you are just visiting. A player sent here waits in Jail until they roll doubles, pay ${inr(CONFIG.jailFine)}, or use a Get out of Jail card.`;
    case 'freeParking':
      return `Taxes and card fines collect here. Land on this tile and you take the whole pot. Right now it holds ${inr(s.pot)}.`;
    case 'goToJail':
      return 'Land here and you go straight to Jail. You do not collect salary.';
    case 'tax':
      return `Pay ${inr(t.amount)}. It goes into the Free Parking pot.`;
    case 'card':
      return t.deck === 'kismat' ? 'Draw a Kismat card. Luck: money, moves, fines, and Jail.' : 'Draw a Khazana card. Everyday money: gifts, bills, and fees.';
    default:
      return '';
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 py-2 last:border-0">
      <span className="text-white/60">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

export default function TileInfo({ s, tile, onClose }: { s: GameState; tile: number; onClose: () => void }) {
  const t = BOARD[tile];
  const pr = s.properties[tile];
  const isProperty = 'price' in t;
  const corrupted = isCorrupted(s, tile);
  const owner = pr?.owner ? s.players.find((p) => p.id === pr.owner) : undefined;
  const here = s.players.filter((p) => !p.bankrupt && p.position === tile);

  let setLine: string | null = null;
  if (t.kind === 'city') {
    const group = GROUP_TILES[t.group];
    const have = owner ? group.filter((i) => s.properties[i].owner === owner.id).length : 0;
    setLine = owner ? `${GROUP_LABEL[t.group]} set: ${owner.name} owns ${have} of ${group.length}` : `${GROUP_LABEL[t.group]} set: ${group.length} tiles`;
  } else if (t.kind === 'holy' || t.kind === 'rail' || t.kind === 'utility') {
    const all = t.kind === 'holy' ? HOLY_TILES : t.kind === 'rail' ? RAIL_TILES : UTILITY_TILES;
    const noun = t.kind === 'holy' ? 'holy tiles' : t.kind === 'rail' ? 'stations' : 'utilities';
    const have = owner ? all.filter((i) => s.properties[i].owner === owner.id).length : 0;
    setLine = owner ? `${owner.name} owns ${have} of ${all.length} ${noun}` : `${all.length} ${noun} on the board`;
  }

  let rentNow: ReactNode = null;
  if (isProperty && owner && !pr.mortgaged) {
    rentNow = t.kind === 'utility' ? `Dice total × ${rentFor(s, tile, 1)}` : corrupted ? `${inr(rentFor(s, tile, 7))} + ${inr(bribeNow(s))} bribe` : inr(rentFor(s, tile, 7));
  }
  const buildings = t.kind === 'city' && pr.houses > 0 ? (pr.houses === 5 ? 'Hotel' : `${pr.houses} house${pr.houses > 1 ? 's' : ''}`) : t.kind === 'city' && owner ? 'None' : null;

  return (
    <Overlay title={t.name} onClose={onClose}>
      {isProperty ? (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Deed tile={tile} s={s} />
          <div className="w-full min-w-0 flex-1">
            <Row label="Owner">
              {owner ? (
                <span className="inline-flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full text-sm" style={{ background: colorOf(owner) }}>
                    {owner.token}
                  </span>
                  {owner.name}
                </span>
              ) : (
                <span className="text-lime">Unowned</span>
              )}
            </Row>
            {t.kind === 'holy' && (
              <Row label="Condition">
                {corrupted ? <span className="text-pink">Corrupted for good</span> : `Holy. ${pr.donations} of ${CONFIG.holy.corruptAfter} donations`}
              </Row>
            )}
            {pr.mortgaged && <Row label="Status"><span className="text-pink">Mortgaged. No rent is collected.</span></Row>}
            {rentNow && <Row label="Rent right now">{rentNow}</Row>}
            {buildings && <Row label="Buildings">{buildings}</Row>}
            {setLine && <Row label="Set">{setLine}</Row>}
            {!owner && <p className="mt-3 text-sm text-white/60">Land here to buy it. If the player declines, everyone bids for it.</p>}
            {here.length > 0 && <Row label="Standing here">{here.map((p) => `${p.token} ${p.name}`).join(', ')}</Row>}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-lg text-white/80">{plain(s, tile)}</p>
          {here.length > 0 && <p className="mt-4 text-white/60">Standing here: {here.map((p) => `${p.token} ${p.name}`).join(', ')}</p>}
        </div>
      )}
    </Overlay>
  );
}
