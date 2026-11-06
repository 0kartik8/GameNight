import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOARD, POS } from './board';
import { playSound } from './sound';
import type { GameState, PlayerId } from './types';

const N = BOARD.length;
const STEP_MS = 130; // time to glide across one tile
const JAIL_MS = 480; // time to slide straight to Jail

export interface Motion {
  /** Tile each token is drawn on right now. Lags behind the game state while a token is walking. */
  shown: Record<PlayerId, number>;
  /** How long each token takes to glide to its next tile, in ms. */
  ms: Record<PlayerId, number>;
  /** The player whose token is walking, or null when everything is still. */
  moving: PlayerId | null;
  /** Milliseconds until the current walk ends. Used to hold sounds back until the token arrives. */
  msLeft: () => number;
}

/** The tiles a token passes through, in order, and how long each hop takes. */
export function pathFor(from: number, to: number, inJail: boolean): { steps: number[]; ms: number } {
  if (from === to) return { steps: [], ms: 0 };
  // Sent to Jail (tile, card, speed limit, three doubles): slide straight there.
  if (to === POS.jail && inJail) return { steps: [to], ms: JAIL_MS };
  // The only backward move in the game is the "go back 3" card.
  if ((from - to + N) % N === 3) return { steps: [1, 2, 3].map((k) => (from - k + N) % N), ms: STEP_MS };
  const fwd = (to - from + N) % N;
  const steps = Array.from({ length: fwd }, (_, k) => (from + k + 1) % N);
  // Long jumps (Advance to Mumbai) speed up so they never take more than about 1.6 seconds.
  return { steps, ms: fwd <= 12 ? STEP_MS : Math.max(50, Math.floor(1600 / fwd)) };
}

export function useTokenMotion(s: GameState): Motion {
  const [shown, setShown] = useState<Record<PlayerId, number>>(() => Object.fromEntries(s.players.map((p) => [p.id, p.position])));
  const [ms, setMs] = useState<Record<PlayerId, number>>({});
  const [moving, setMoving] = useState<PlayerId | null>(null);
  const planned = useRef<Record<PlayerId, number>>(Object.fromEntries(s.players.map((p) => [p.id, p.position])));
  const queues = useRef<Record<PlayerId, number[]>>({});
  const hop = useRef<Record<PlayerId, number>>({});
  const timer = useRef<number | null>(null);

  const tick = () => {
    const ids = Object.keys(queues.current).filter((id) => queues.current[id].length > 0);
    if (ids.length === 0) {
      timer.current = null;
      setMoving(null);
      return;
    }
    const nextTile: Record<PlayerId, number> = {};
    const nextMs: Record<PlayerId, number> = {};
    for (const id of ids) {
      nextTile[id] = queues.current[id].shift() as number;
      nextMs[id] = hop.current[id] ?? STEP_MS;
    }
    setShown((cur) => ({ ...cur, ...nextTile }));
    setMs((cur) => ({ ...cur, ...nextMs }));
    setMoving(ids[0]);
    const wait = Math.max(...ids.map((id) => nextMs[id]));
    if (wait < JAIL_MS) playSound('step');
    timer.current = window.setTimeout(tick, wait);
  };

  const key = s.players.map((p) => `${p.id}:${p.position}:${p.bankrupt ? 1 : 0}:${p.inJail ? 1 : 0}`).join('|');
  // Layout effect: the walk starts before the browser paints, so the token never sits on the old tile for a frame.
  useLayoutEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let any = false;
    for (const p of s.players) {
      const from = planned.current[p.id] ?? p.position;
      if (from === p.position) continue;
      planned.current[p.id] = p.position;
      if (calm || p.bankrupt) {
        queues.current[p.id] = [];
        setShown((cur) => ({ ...cur, [p.id]: p.position }));
        continue;
      }
      const plan = pathFor(from, p.position, p.inJail);
      queues.current[p.id] = [...(queues.current[p.id] ?? []), ...plan.steps];
      hop.current[p.id] = plan.ms;
      any = true;
    }
    if (any && timer.current === null) tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const msLeft = (): number => {
    let m = 0;
    for (const id of Object.keys(queues.current)) {
      const inFlight = timer.current !== null ? 1 : 0;
      m = Math.max(m, (queues.current[id].length + inFlight) * (hop.current[id] ?? STEP_MS));
    }
    return m;
  };

  return { shown, ms, moving, msLeft };
}
