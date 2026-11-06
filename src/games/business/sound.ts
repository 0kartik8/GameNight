// Sound effects for Business. Everything is synthesized with the Web Audio API,
// so there are no audio files to download, license, or host.

export type SoundName =
  | 'diceRoll' | 'diceLand' | 'step' | 'salary' | 'buy' | 'coins' | 'tax' | 'jackpot' | 'blessing' | 'corrupt' | 'card'
  | 'jail' | 'unlock' | 'bid' | 'gavel' | 'build' | 'mortgage' | 'offer' | 'dealDone' | 'decline' | 'bankrupt' | 'win';

type Ctx = BaseAudioContext;
type Builder = (c: Ctx, out: AudioNode, t: number) => void;

// ---------------------------------------------------------------- building blocks
interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; lp?: number }

function tone(c: Ctx, out: AudioNode, t: number, freq: number, dur: number, o: ToneOpts = {}): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(c: Ctx): AudioBuffer {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, Math.floor(c.sampleRate), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}

interface NoiseOpts { type?: BiquadFilterType; freq?: number; q?: number; gain?: number }

function noise(c: Ctx, out: AudioNode, t: number, dur: number, o: NoiseOpts = {}): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.value = o.freq ?? 2000;
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// ---------------------------------------------------------------- the sounds
const RAW: Record<SoundName, Builder> = {
  // dice rattling in a cup
  diceRoll: (c, o, t) => {
    for (let i = 0; i < 13; i++) {
      const at = t + i * 0.062 + Math.random() * 0.02;
      noise(c, o, at, 0.05, { freq: 1800 + Math.random() * 1800, q: 1.5, gain: 0.22 * (1 - i / 18) });
      if (i % 3 === 0) tone(c, o, at, 140 + Math.random() * 40, 0.06, { type: 'triangle', gain: 0.12 });
    }
  },
  // two dice hitting the table
  diceLand: (c, o, t) => {
    noise(c, o, t, 0.1, { type: 'lowpass', freq: 900, gain: 0.35 });
    tone(c, o, t, 150, 0.12, { to: 60, gain: 0.35 });
    noise(c, o, t + 0.1, 0.09, { type: 'lowpass', freq: 1200, gain: 0.25 });
    tone(c, o, t + 0.1, 180, 0.1, { to: 80, gain: 0.25 });
  },
  step: (c, o, t) => tone(c, o, t, 620, 0.05, { type: 'triangle', gain: 0.12, to: 420 }),
  // cheerful chime: you collected salary or money
  salary: (c, o, t) => {
    tone(c, o, t, 880, 0.12, { type: 'triangle', gain: 0.2 });
    tone(c, o, t + 0.09, 1320, 0.3, { type: 'triangle', gain: 0.2 });
    tone(c, o, t + 0.18, 1760, 0.35, { gain: 0.12 });
  },
  // cash register
  buy: (c, o, t) => {
    noise(c, o, t, 0.04, { freq: 5000, gain: 0.2 });
    tone(c, o, t + 0.02, 1175, 0.1, { type: 'triangle', gain: 0.2 });
    tone(c, o, t + 0.1, 1568, 0.45, { gain: 0.25 });
    tone(c, o, t + 0.1, 2349, 0.3, { gain: 0.08 });
  },
  // coins clinking away
  coins: (c, o, t) => {
    [0, 0.07, 0.13, 0.2].forEach((d, i) => {
      tone(c, o, t + d, [2600, 2200, 2900, 2400][i], 0.12, { gain: 0.13 });
      noise(c, o, t + d, 0.03, { type: 'highpass', freq: 6000, gain: 0.05 });
    });
  },
  tax: (c, o, t) => {
    tone(c, o, t, 120, 0.3, { to: 60, gain: 0.4 });
    noise(c, o, t, 0.12, { type: 'lowpass', freq: 400, gain: 0.3 });
  },
  // Free Parking jackpot
  jackpot: (c, o, t) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, o, t + i * 0.07, f, 0.25, { type: 'triangle', gain: 0.2 }));
    for (let i = 0; i < 6; i++) tone(c, o, t + 0.35 + i * 0.05, 2400 + Math.random() * 600, 0.1, { gain: 0.1 });
  },
  // a temple bell, used for holy-city donations
  blessing: (c, o, t) => {
    tone(c, o, t, 523, 1.4, { gain: 0.22 });
    tone(c, o, t, 1047, 1.1, { gain: 0.1 });
    tone(c, o, t, 1568, 0.8, { gain: 0.05 });
    tone(c, o, t + 0.02, 784, 1.2, { gain: 0.08 });
  },
  // a holy city turns corrupted: a low gong that goes sour
  corrupt: (c, o, t) => {
    tone(c, o, t, 82, 1.6, { gain: 0.35, to: 70 });
    tone(c, o, t, 87, 1.4, { type: 'triangle', gain: 0.25 });
    tone(c, o, t + 0.05, 233, 1.0, { type: 'sawtooth', gain: 0.1, lp: 600 });
    tone(c, o, t + 0.35, 185, 0.9, { type: 'sawtooth', gain: 0.08, lp: 500 });
    noise(c, o, t, 0.5, { type: 'lowpass', freq: 300, gain: 0.3 });
  },
  card: (c, o, t) => {
    noise(c, o, t, 0.12, { type: 'highpass', freq: 3000, gain: 0.18 });
    tone(c, o, t, 300, 0.14, { type: 'triangle', gain: 0.1, to: 1200 });
    tone(c, o, t + 0.14, 1318, 0.25, { gain: 0.15 });
  },
  // siren and a cell door
  jail: (c, o, t) => {
    tone(c, o, t, 520, 0.3, { type: 'sawtooth', gain: 0.12, to: 860, lp: 2500 });
    tone(c, o, t + 0.3, 860, 0.3, { type: 'sawtooth', gain: 0.12, to: 520, lp: 2500 });
    noise(c, o, t + 0.62, 0.25, { freq: 1100, q: 4, gain: 0.3 });
    tone(c, o, t + 0.62, 330, 0.3, { type: 'square', gain: 0.1 });
  },
  unlock: (c, o, t) => {
    noise(c, o, t, 0.03, { freq: 3500, gain: 0.25 });
    noise(c, o, t + 0.09, 0.03, { freq: 3500, gain: 0.25 });
    tone(c, o, t + 0.09, 900, 0.08, { gain: 0.1 });
  },
  bid: (c, o, t) => tone(c, o, t, 1000, 0.06, { type: 'square', gain: 0.08 }),
  // auction hammer
  gavel: (c, o, t) => {
    [0, 0.16].forEach((d, i) => {
      tone(c, o, t + d, 200 - i * 30, 0.1, { type: 'square', gain: 0.25, to: 110 });
      noise(c, o, t + d, 0.08, { type: 'lowpass', freq: 700, gain: 0.3 });
    });
  },
  // three hammer knocks
  build: (c, o, t) => {
    [0, 0.12, 0.24].forEach((d) => {
      noise(c, o, t + d, 0.05, { freq: 1500, gain: 0.3 });
      tone(c, o, t + d, 240, 0.08, { type: 'triangle', gain: 0.25, to: 150 });
    });
  },
  mortgage: (c, o, t) => {
    tone(c, o, t, 170, 0.18, { type: 'square', gain: 0.18, to: 100, lp: 800 });
    noise(c, o, t, 0.1, { freq: 600, gain: 0.2 });
  },
  offer: (c, o, t) => {
    tone(c, o, t, 880, 0.14, { gain: 0.18 });
    tone(c, o, t + 0.12, 1175, 0.22, { gain: 0.18 });
  },
  dealDone: (c, o, t) => {
    [523, 659, 784].forEach((f, i) => tone(c, o, t + i * 0.06, f, 0.55, { type: 'triangle', gain: 0.18 }));
    tone(c, o, t + 0.2, 1047, 0.5, { gain: 0.12 });
  },
  decline: (c, o, t) => {
    tone(c, o, t, 440, 0.15, { type: 'triangle', gain: 0.2 });
    tone(c, o, t + 0.14, 330, 0.3, { type: 'triangle', gain: 0.2 });
  },
  // sad trombone
  bankrupt: (c, o, t) => {
    [392, 370, 349].forEach((f, i) => tone(c, o, t + i * 0.32, f, 0.3, { type: 'sawtooth', gain: 0.14, lp: 1200 }));
    tone(c, o, t + 0.96, 330, 0.8, { type: 'sawtooth', gain: 0.14, to: 230, lp: 1000 });
  },
  // fanfare
  win: (c, o, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t + i * 0.12, f, 0.18, { type: 'triangle', gain: 0.22 }));
    [523, 659, 784, 1047].forEach((f) => tone(c, o, t + 0.5, f, 1, { type: 'triangle', gain: 0.14 }));
    noise(c, o, t + 0.5, 0.3, { type: 'highpass', freq: 5000, gain: 0.08 });
  },
};

// Loudness trim per sound, so frequent sounds (dice, steps) are heard and bright ones (coins, fanfare) do not jump out.
const LEVEL: Partial<Record<SoundName, number>> = {
  diceRoll: 2.2, step: 1.6, bid: 1.9, jail: 1.8, bankrupt: 1.8, unlock: 1.4, salary: 1.3, jackpot: 1.2, coins: 0.55, win: 0.7, blessing: 0.9,
};

export const SOUNDS = Object.fromEntries(
  (Object.keys(RAW) as SoundName[]).map((name): [SoundName, Builder] => [
    name,
    (c, out, t) => {
      const trim = c.createGain();
      trim.gain.value = LEVEL[name] ?? 1;
      trim.connect(out);
      RAW[name](c, trim, t);
    },
  ]),
) as Record<SoundName, Builder>;

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

// ---------------------------------------------------------------- live playback
const KEY = 'gamenight-sound-off';
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    // private mode: the choice just lasts until reload
  }
}

let live: { c: AudioContext; out: AudioNode } | null = null;
function liveContext(): { c: AudioContext; out: AudioNode } | null {
  if (!live) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const c = new Ctor();
    const master = c.createGain();
    master.gain.value = 0.6;
    const comp = c.createDynamicsCompressor(); // stops overlapping sounds from clipping
    master.connect(comp);
    comp.connect(c.destination);
    live = { c, out: master };
  }
  if (live.c.state === 'suspended') void live.c.resume();
  return live;
}

/** Play a sound now, or after `delay` seconds. Never throws: audio must not break the game. */
export function playSound(name: SoundName, delay = 0): void {
  if (muted) return;
  try {
    const l = liveContext();
    if (l) SOUNDS[name](l.c, l.out, l.c.currentTime + 0.01 + delay);
  } catch {
    // ignore
  }
}
