import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button, Dialog } from '../../components/ui';
import JokerReveal from './Jokers';
import Overlay from './Overlay';
import { StatsTable } from './Stage';
import type { Player } from './types';
import { colorOf } from './view';
import BoardView from './BoardView';
import Manager from './Manager';
import Rulebook from './Rulebook';
import Sidebar from './Sidebar';
import { isMuted, playSound, setMuted } from './sound';
import Stage from './Stage';
import TileInfo from './TileInfo';
import { TradeCompose, TradeReview } from './TradeModal';
import { useLogSounds } from './useSounds';
import { useTokenMotion } from './useTokenMotion';
import type { Action, GameState } from './types';

interface Props {
  s: GameState;
  send: (a: Action) => void;
  onRematch: () => void;
  onNewGame: () => void;
  /** Only for previews and tests: open a panel on first render. */
  initial?: { manager?: boolean; info?: number; rules?: boolean; trade?: boolean };
}

/** The whole in-game screen: board with stage in the middle, players and log on the side. */
/** Shows the Joker line to everyone for a few seconds, every time a Joker is used. */
function JokerFlash({ s }: { s: GameState }) {
  const last = [...s.log].reverse().find((e) => e.text.includes('plays a Joker:'));
  const seenRef = useRef<number | null>(last ? last.seq : null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!last || last.seq === seenRef.current) return;
    seenRef.current = last.seq;
    setShown(last.text);
    const id = window.setTimeout(() => setShown(null), 4500);
    return () => window.clearTimeout(id);
  }, [last?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[70] flex justify-center">
      <div className="pop max-w-2xl rounded-2xl bg-panel/95 px-6 py-4 text-center shadow-2xl ring-2 ring-lime">
        <p className="font-display text-2xl font-extrabold text-lime">{shown}</p>
      </div>
    </div>
  );
}

export default function GameView({ s, send: rawSend, onRematch, onNewGame, initial }: Props) {
  const [manager, setManager] = useState(initial?.manager ?? false);
  const [info, setInfo] = useState<number | null>(initial?.info ?? null);
  const [rules, setRules] = useState(initial?.rules ?? false);
  const [trade, setTrade] = useState(initial?.trade ?? false);
  const [quit, setQuit] = useState(false);
  const [joker, setJoker] = useState<{ owner: Player; cardId: string } | null>(null);
  const [votes, setVotes] = useState(false);
  const [summaryClosed, setSummaryClosed] = useState(false);
  const ended = s.phase.t === 'gameOver';
  const alive = s.players.filter((p) => !p.bankrupt);
  const needed = Math.floor(alive.length / 2) + 1;
  const [silent, setSilent] = useState(isMuted());
  const motion = useTokenMotion(s);
  useLogSounds(s, motion.msLeft);
  // While a token is still walking, ignore game actions so nothing happens out of order.
  const send = (a: Action) => {
    if (!motion.moving) rawSend(a);
  };
  const toggleSound = () => {
    const next = !silent;
    setMuted(next);
    setSilent(next);
    if (!next) playSound('offer'); // a short ping so you know it is on
  };
  const canTrade = s.phase.t === 'turnStart' || s.phase.t === 'turnEnd';
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-violet/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-1/3 size-96 rounded-full bg-pink/15 blur-3xl" />
      <div className="relative flex h-full items-stretch justify-center gap-4 p-3">
        <div className="shrink-0 self-center" style={{ width: 'min(calc(100dvh - 1.5rem), calc(100vw - 26rem))', aspectRatio: '1 / 1' }}>
          <BoardView s={s} onTileClick={setInfo} motion={motion}>
            <Stage s={s} send={send} openManager={() => setManager(true)} openTrade={() => setTrade(true)} moving={motion.moving !== null} onRematch={onRematch} onNewGame={onNewGame} />
          </BoardView>
        </div>
        <Sidebar s={s} onOpenJoker={(owner, cardId) => setJoker({ owner, cardId })}>
          {!ended && (
            <Button variant="ghost" className="shrink-0" onClick={() => setVotes(true)}>
              Vote to end the game ({s.endVotes.length}/{needed})
            </Button>
          )}
          {ended && summaryClosed && (
            <Button className="shrink-0" onClick={() => setSummaryClosed(false)}>
              Show game summary
            </Button>
          )}
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setRules(true)}>
              Rules
            </Button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={silent ? 'Sound off' : 'Sound on'}
              aria-pressed={!silent}
              title={silent ? 'Sound is off. Click to turn it on.' : 'Sound is on. Click to mute.'}
              className="rounded-2xl bg-white/10 px-4 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
            >
              {silent ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </button>
            <Button variant="ghost" className="flex-1" onClick={() => setQuit(true)}>
              Quit game
            </Button>
          </div>
        </Sidebar>
      </div>
      {manager && s.phase.t !== 'gameOver' && <Manager s={s} send={send} onClose={() => setManager(false)} />}
      {info !== null && <TileInfo s={s} tile={info} onClose={() => setInfo(null)} />}
      {rules && <Rulebook onClose={() => setRules(false)} />}
      {trade && canTrade && !s.pendingTrade && <TradeCompose s={s} send={send} onClose={() => setTrade(false)} />}
      <TradeReview s={s} send={send} />
      <JokerFlash s={s} />
      {ended && !summaryClosed && (
        <Overlay title="Game summary" wide onClose={() => setSummaryClosed(true)}>
          <StatsTable s={s} />
        </Overlay>
      )}
      {joker && s.players.find((p) => p.id === joker.owner.id)?.jokers.includes(joker.cardId) && <JokerReveal s={s} owner={s.players.find((p) => p.id === joker.owner.id) ?? joker.owner} cardId={joker.cardId} send={send} onClose={() => setJoker(null)} />}
      <Dialog open={votes} onClose={() => setVotes(false)} title="Vote to end the game">
        <p className="mb-3 text-white/70">The game ends after the current turn once more than half the players vote yes. Tap a name to vote, tap again to take the vote back.</p>
        <div className="space-y-2">
          {alive.map((p) => {
            const yes = s.endVotes.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => send({ type: 'VOTE_END', player: p.id })} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-white ${yes ? 'bg-pink/30' : 'bg-white/5 hover:bg-white/10'}`}>
                <span className="grid size-8 place-items-center rounded-full" style={{ background: colorOf(p) }}>{p.token}</span>
                <span className="flex-1">{p.name}</span>
                <span className="text-sm">{yes ? 'Voted to end' : 'Keep playing'}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-white/60">{s.endPending ? 'Majority reached. The game ends after this turn.' : `${needed} of ${alive.length} needed.`}</p>
      </Dialog>
      <Dialog open={quit} onClose={() => setQuit(false)} title="Quit this game?">
        <p className="mb-4 text-white/70">Progress is not saved yet. Everyone goes back to setup.</p>
        <div className="flex gap-3">
          <Button className="flex-1" variant="ghost" onClick={() => setQuit(false)}>
            Keep playing
          </Button>
          <Button className="flex-1" onClick={onNewGame}>
            Quit
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
