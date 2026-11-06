import { BOARD, mortgageValue } from './board';
import { isCorrupted } from './engine';
import type { GameState } from './types';
import { bandColor, deedRows, inr, tileBand } from './view';

/** The property card: color header, price, rent table, mortgage value. */
export default function Deed({ tile, compact, s }: { tile: number; compact?: boolean; s?: GameState }) {
  const t = BOARD[tile];
  const rows = deedRows(t, s, tile);
  const corrupted = s !== undefined && isCorrupted(s, tile);
  const shown = compact ? rows.slice(0, 3) : rows;
  return (
    <div className="w-72 overflow-hidden rounded-2xl bg-white text-left text-ink shadow-xl">
      <div className="px-4 py-2.5 text-center" style={{ background: (s ? tileBand(s, tile) : bandColor(t)) ?? '#94a3b8', color: corrupted ? '#fff' : undefined }}>
        <div className="font-display text-2xl font-extrabold leading-tight">{t.name}</div>
        {'price' in t && <div className="font-bold">{corrupted ? 'Corrupted. ' : ''}Price {inr(t.price)}</div>}
      </div>
      <dl className="space-y-0.5 px-4 py-2.5 text-sm">
        {shown.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt>{k}</dt>
            <dd className="font-bold tabular-nums">{v}</dd>
          </div>
        ))}
        {!compact && 'price' in t && (
          <div className="flex justify-between gap-3 border-t border-ink/15 pt-1">
            <dt>Mortgage value</dt>
            <dd className="font-bold tabular-nums">{inr(mortgageValue(t.price))}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
