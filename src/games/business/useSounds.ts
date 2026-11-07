import { useEffect, useRef } from 'react';
import { playSound } from './sound';
import type { SoundName } from './sound';
import type { GameState, LogEntry } from './types';

/** Which sound goes with a game-log entry. Dice sounds are played by the Stage, not here. */
export function soundFor(e: LogEntry): SoundName | null {
  const text = e.text;
  switch (e.kind) {
    case 'salary':
      return 'salary';
    case 'bribe':
      return 'coins';
    case 'heist':
      return 'card';
    case 'uno':
      return 'unlock';
    case 'block':
      return 'mortgage';
    case 'market':
      return 'offer';
    case 'joker':
      return 'card';
    case 'vote':
      return 'offer';
    case 'buy':
      return 'buy';
    case 'rent':
      return 'coins';
    case 'tax':
      return 'tax';
    case 'pot':
      return 'jackpot';
    case 'donate':
      return 'blessing'; // temple bell
    case 'corrupt':
      return 'corrupt';
    case 'card':
      if (text.includes(' draws ')) return 'card';
      if (text.includes('Get out of Jail')) return 'unlock';
      if (text.includes('collects')) return 'salary';
      if (text.includes('pays')) return 'coins';
      return 'offer';
    case 'jail':
      return text.includes('stays in Jail') ? null : 'jail';
    case 'jailExit':
      return 'unlock';
    case 'auction':
      if (text.includes(' wins ')) return 'gavel';
      if (text.includes(' bids ') || text.includes('starts')) return 'bid';
      return null;
    case 'build':
      return 'build';
    case 'sell':
      return 'coins';
    case 'mortgage':
      return 'mortgage';
    case 'trade':
      if (text.includes('complete a trade')) return 'dealDone';
      if (text.includes('declines')) return 'decline';
      return 'offer';
    case 'bankrupt':
      return 'bankrupt';
    case 'win':
      return 'win';
    default:
      return null; // roll, round
  }
}

const GAP = 0.24; // seconds between sounds that come from the same action
const MAX_PER_ACTION = 4;

/**
 * Plays a sound for every log entry added since the last render. Starts silent: old entries are skipped.
 * holdMs says how long a token is still walking, so the salary chime or rent coins land when it arrives.
 */
export function useLogSounds(s: GameState, holdMs: () => number = () => 0): void {
  const seen = useRef(s.log.length ? s.log[s.log.length - 1].seq : 0);
  useEffect(() => {
    const last = s.log.length ? s.log[s.log.length - 1].seq : 0;
    if (last < seen.current) {
      seen.current = last; // a new game started
      return;
    }
    const fresh = s.log.filter((e) => e.seq > seen.current);
    seen.current = last;
    let delay = holdMs() / 1000;
    let n = 0;
    for (const e of fresh) {
      const name = soundFor(e);
      if (!name || n >= MAX_PER_ACTION) continue;
      playSound(name, delay);
      delay += GAP;
      n++;
    }
  }, [s.log]);
}
