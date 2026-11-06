import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button, Dialog } from '../../components/ui';
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
export default function GameView({ s, send: rawSend, onRematch, onNewGame, initial }: Props) {
  const [manager, setManager] = useState(initial?.manager ?? false);
  const [info, setInfo] = useState<number | null>(initial?.info ?? null);
  const [rules, setRules] = useState(initial?.rules ?? false);
  const [trade, setTrade] = useState(initial?.trade ?? false);
  const [quit, setQuit] = useState(false);
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
        <Sidebar s={s}>
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
