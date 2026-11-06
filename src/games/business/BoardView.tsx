import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BOARD } from './board';
import { isCorrupted } from './engine';
import type { GameState, Player } from './types';
import type { Motion } from './useTokenMotion';
import { cell, colorOf, inr, TILE_ICON, tileBand } from './view';

// Sizes use cqw (percent of board width) so the board reads the same on a laptop and a TV.
const cq = (n: number) => `${n}cqw`;

function Houses({ n }: { n: number }) {
  if (n === 5) return <span className="rounded-sm bg-ink" style={{ width: cq(1.7), height: cq(0.9) }} aria-label="hotel" />;
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className="rounded-[1px] bg-ink" style={{ width: cq(0.9), height: cq(0.9) }} />
      ))}
    </>
  );
}

function Tile({ i, s, shownAt, onClick }: { i: number; s: GameState; shownAt: number; onClick?: (i: number) => void }) {
  const t = BOARD[i];
  const c = cell(i);
  const pr = s.properties[i];
  const owner = pr?.owner ? s.players.find((p) => p.id === pr.owner) : undefined;
  const cur = s.players[s.current];
  const isCurrent = !cur.bankrupt && shownAt === i;
  const corrupted = isCorrupted(s, i);
  const band = tileBand(s, i);
  const vertical = c.side === 'left' || c.side === 'right';
  const dir = c.side === 'bottom' ? 'flex-col' : c.side === 'top' ? 'flex-col-reverse' : c.side === 'left' ? 'flex-row-reverse' : c.side === 'right' ? 'flex-row' : 'flex-col';
  const corner = c.side === 'corner';

  let label: ReactNode = t.name;
  let sub: ReactNode = null;
  if (t.kind === 'card') {
    label = t.name;
  } else if (t.kind === 'tax') {
    sub = inr(t.amount);
  } else if ('price' in t) {
    sub = inr(t.price);
  } else if (t.kind === 'freeParking') {
    sub = s.pot > 0 ? inr(s.pot) : null;
  }
  const icon = t.kind === 'card' ? (t.deck === 'kismat' ? '🍀' : '💰') : corrupted ? '🏚️' : TILE_ICON[t.kind];

  return (
    <button
      type="button"
      onClick={() => onClick?.(i)}
      aria-label={`${t.name}. Show details`}
      data-tile={i}
      className={`relative flex min-h-0 min-w-0 cursor-pointer overflow-hidden rounded-md transition ${corrupted ? 'bg-[#2b0f1a]' : 'bg-panel'} hover:brightness-125 focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${dir} ${isCurrent ? 'z-10 outline outline-2 outline-lime' : ''} ${pr?.mortgaged ? 'opacity-55' : ''}`}
      style={{ gridRow: c.row, gridColumn: c.col, boxShadow: owner ? `inset 0 0 0 2px ${colorOf(owner)}` : undefined }}
    >
      {band && (
        <div className={`flex shrink-0 items-center justify-center gap-px ${vertical ? 'flex-col' : ''}`} style={{ background: band, [vertical ? 'width' : 'height']: cq(1.7) }}>
          {pr && pr.houses > 0 && <Houses n={pr.houses} />}
          {/* dots count the donations a holy city has taken */}
          {t.kind === 'holy' && !corrupted && pr.donations > 0 && <Houses n={pr.donations} />}
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-px px-0.5 text-center leading-none">
        {icon && <span style={{ fontSize: cq(corner ? 2.9 : 1.8) }}>{icon}</span>}
        <span className="font-display font-bold leading-tight" style={{ fontSize: cq(corner ? 1.75 : 1.38) }}>
          {label}
        </span>
        {sub && (
          <span className="font-bold text-amber" style={{ fontSize: cq(corner ? 1.75 : 1.38) }}>
            {sub}
          </span>
        )}
      </div>
      {pr?.mortgaged && (
        <span className="absolute right-0.5 top-0.5 rounded bg-pink px-1 font-bold" style={{ fontSize: cq(1.05) }}>
          M
        </span>
      )}
    </button>
  );
}

interface Geo {
  w: number;
  tiles: { x: number; y: number; w: number; h: number }[];
}

/** Tokens live above the tiles so they can glide from tile to tile. */
function Tokens({ s, geo, motion }: { s: GameState; geo: Geo; motion?: Motion }) {
  const size = geo.w * 0.03;
  const groups = new Map<number, Player[]>();
  for (const p of s.players) {
    if (p.bankrupt) continue;
    const at = motion?.shown[p.id] ?? p.position;
    groups.set(at, [...(groups.get(at) ?? []), p]);
  }
  const gap = size * 1.08;
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {[...groups].flatMap(([tile, ps]) =>
        ps.map((p, k) => {
          const g = geo.tiles[tile];
          const cols = ps.length <= 2 ? ps.length : 3;
          const rows = Math.ceil(ps.length / cols);
          const x = g.x + ((k % cols) - (cols - 1) / 2) * gap;
          const y = g.y + g.h * 0.28 + (Math.floor(k / cols) - (rows - 1)) * gap;
          const walking = motion?.moving === p.id;
          const ms = motion?.ms[p.id] ?? 0;
          return (
            <div
              key={p.id}
              data-token={p.id}
              aria-label={`${p.name}'s token`}
              className="absolute left-0 top-0"
              style={{
                width: size,
                height: size,
                zIndex: walking ? 2 : 1,
                transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
                transition: ms ? `transform ${ms}ms linear` : 'none',
              }}
            >
              {/* The little hop-up scale is on its own layer so it never restarts the glide. */}
              <div
                className="grid size-full place-items-center rounded-full shadow-md transition-transform duration-150"
                style={{ fontSize: size * 0.58, background: colorOf(p), transform: walking ? 'scale(1.22)' : 'scale(1)' }}
              >
                {p.token}
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

export default function BoardView({ s, children, onTileClick, motion }: { s: GameState; children: ReactNode; onTileClick?: (i: number) => void; motion?: Motion }) {
  const root = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const tiles = BOARD.map((_, i) => {
        const b = el.querySelector(`[data-tile="${i}"]`)?.getBoundingClientRect();
        return b ? { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2, w: b.width, h: b.height } : { x: 0, y: 0, w: 0, h: 0 };
      });
      setGeo({ w: r.width, tiles });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cur = s.players[s.current];
  const curAt = motion?.shown[cur.id] ?? cur.position;
  return (
    <div
      ref={root}
      className="@container relative grid h-full w-full gap-[3px] rounded-3xl bg-white/5 p-1.5"
      style={{ gridTemplateColumns: '1.5fr repeat(9, 1fr) 1.5fr', gridTemplateRows: '1.5fr repeat(9, 1fr) 1.5fr' }}
    >
      {BOARD.map((_, i) => (
        <Tile key={i} i={i} s={s} shownAt={curAt} onClick={onTileClick} />
      ))}
      <div className="min-h-0 min-w-0" style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}>
        {children}
      </div>
      {geo && <Tokens s={s} geo={geo} motion={motion} />}
    </div>
  );
}
