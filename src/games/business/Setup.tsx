import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button, Chip, Shell } from '../../components/ui';
import { CONFIG } from './config';
import Rulebook from './Rulebook';
import type { WinCondition } from './types';
import { colorOf, inr, TOKENS } from './view';

export interface SetupResult {
  players: { name: string; token: string }[];
  win: WinCondition;
}

const ROUNDS = CONFIG.roundOptions;

export default function Setup({ onStart, initial }: { onStart: (r: SetupResult) => void; initial?: SetupResult }) {
  const [names, setNames] = useState<string[]>(initial?.players.map((p) => p.name) ?? ['', '', '']);
  const [tokens, setTokens] = useState<string[]>(initial?.players.map((p) => p.token) ?? TOKENS.slice(0, 3));
  const [win, setWin] = useState<WinCondition>(initial?.win ?? { mode: 'lastStanding' });
  const [err, setErr] = useState('');
  const [rules, setRules] = useState(false);

  const cycleToken = (i: number) => {
    const free = TOKENS.filter((t) => t === tokens[i] || !tokens.includes(t));
    setTokens(tokens.map((t, j) => (j === i ? free[(free.indexOf(t) + 1) % free.length] : t)));
  };
  const add = () => {
    setNames([...names, '']);
    setTokens([...tokens, TOKENS.find((t) => !tokens.includes(t)) ?? TOKENS[0]]);
  };
  const remove = (i: number) => {
    setNames(names.filter((_, j) => j !== i));
    setTokens(tokens.filter((_, j) => j !== i));
  };
  const start = () => {
    const clean = names.map((n) => n.trim());
    if (clean.some((n) => !n)) return setErr('Fill every name.');
    if (new Set(clean.map((n) => n.toLowerCase())).size !== clean.length) return setErr('Names must be unique.');
    setErr('');
    onStart({ players: clean.map((name, i) => ({ name, token: tokens[i] })), win });
  };
  const isRounds = (n: number) => win.mode === 'rounds' && win.rounds === n;

  return (
    <Shell>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-white/60 hover:text-white">
        <ArrowLeft className="size-4" />
        Home
      </Link>
      <div className="pop space-y-6">
        <div>
          <h1 className="font-display text-5xl font-extrabold">Business</h1>
          <p className="mt-2 text-white/70">
            Buy Indian cities, build, trade, and bankrupt your friends. Everyone plays on this one screen. Each player starts with {inr(CONFIG.startCash)} and earns {inr(CONFIG.salary)} every time they pass Start.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-white/60">Players ({CONFIG.players.min} to {CONFIG.players.max}). Tap a token to change it.</p>
          {names.map((n, i) => (
            <div key={i} className="flex gap-2">
              <button
                aria-label={`Change token for player ${i + 1}`}
                onClick={() => cycleToken(i)}
                className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: colorOf({ id: `p${i + 1}` }) }}
              >
                {tokens[i]}
              </button>
              <input
                value={n}
                maxLength={14}
                placeholder={`Player ${i + 1}`}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-pink"
              />
              {names.length > CONFIG.players.min && (
                <button aria-label={`Remove player ${i + 1}`} onClick={() => remove(i)} className="rounded-2xl bg-white/10 px-3 outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {names.length < CONFIG.players.max && (
            <Button variant="ghost" onClick={add}>
              <Plus className="mr-1 inline size-4" />
              Add player
            </Button>
          )}
        </div>

        <div>
          <p className="mb-2 text-white/60">How does the game end?</p>
          <div className="flex flex-wrap gap-2">
            <Chip on={win.mode === 'lastStanding'} onClick={() => setWin({ mode: 'lastStanding' })}>
              Last player standing
            </Chip>
            {ROUNDS.map((n) => (
              <Chip key={n} on={isRounds(n)} onClick={() => setWin({ mode: 'rounds', rounds: n })}>
                {n} rounds
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-sm text-white/50">
            {win.mode === 'lastStanding' ? 'Play until everyone else is bankrupt.' : `After ${win.rounds} rounds the richest player wins. Cash, property, and buildings all count.`}
          </p>
        </div>

        {err && (
          <p role="alert" className="rounded-2xl bg-pink/20 px-4 py-3 text-pink">
            {err}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setRules(true)}>
            Read the rules
          </Button>
          <Button className="flex-1" onClick={start}>
            Start game
          </Button>
        </div>
      </div>
      {rules && <Rulebook onClose={() => setRules(false)} />}
    </Shell>
  );
}
