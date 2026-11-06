import { useCallback, useState } from 'react';
import { reduce, startGame } from './engine';
import GameView from './GameView';
import Setup from './Setup';
import type { SetupResult } from './Setup';
import type { Action, GameState } from './types';

const newSeed = (): number => Math.floor(Math.random() * 2 ** 32);

export default function BusinessGame() {
  const [setup, setSetup] = useState<SetupResult | undefined>();
  const [s, setS] = useState<GameState | null>(null);
  const [gen, setGen] = useState(0); // bumps on every new game so the board starts fresh
  // reduce is pure and returns the same object for illegal actions, so double calls in StrictMode are harmless
  const send = useCallback((a: Action) => setS((cur) => (cur ? reduce(cur, a) : cur)), []);

  const start = (r: SetupResult) => {
    setSetup(r);
    setS(startGame(r.players, r.win, newSeed()));
    setGen((g) => g + 1);
  };

  if (!s || !setup) return <Setup onStart={start} initial={setup} />;
  const rematch = () => {
    setS(startGame(setup.players, setup.win, newSeed()));
    setGen((g) => g + 1);
  };
  return <GameView key={gen} s={s} send={send} onRematch={rematch} onNewGame={() => setS(null)} />;
}
