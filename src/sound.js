// Synthesized sound: no files, no licences (owner rule 2026-08-07: nothing
// ships without its credit line, and code needs none). The direction is
// design pass 03 section g, followed note for note: an instrument, not a
// jingle — restrained, wooden, a period PA rather than a game. The bell is
// a falling minor third (G4 to E4, soft mallet), the achievement resolves
// the same third upward, the era holds a major chord that rises with the
// decades, the fare is a tick felt more than heard whose pitch lifts
// faintly with the amount, and the incident is a low buzz that means
// attention, never alarm. The ambient bed from the direction is deferred:
// it is off by default there, and off is free.
//
// Everything routes through one master gain. The context is created only on
// a user gesture (unlock()), because browsers rightly refuse sound before
// one; every call before that is a silent no-op, as is everything when the
// setting is off.

let ctx = null;
let master = null;
let on = true;
let lastFareAt = 0;

export function setOn(v) {
  on = !!v;
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    ctx = null; // no audio here; every call stays a no-op
  }
}

function tone(freq, { at = 0, dur = 0.25, type = 'sine', gain = 0.4, attack = 0.005, lp = 0 } = {}) {
  if (!ctx || !on) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let head = osc;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    osc.connect(f);
    head = f;
  }
  head.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// AVGÅNG: two-tone, falling minor third, soft mallet, short decay.
export function bell() {
  tone(392.0, { dur: 0.5, gain: 0.5 });
  tone(329.63, { at: 0.14, dur: 0.8, gain: 0.45 });
}

// The bell's third, resolved upward: a small confirmation, not a fanfare.
export function achievement() {
  tone(329.63, { dur: 0.3, gain: 0.32 });
  tone(392.0, { at: 0.11, dur: 0.6, gain: 0.38 });
}

// A single warm tick, felt more than heard; pitch rises faintly with the
// amount. Fares land constantly, so this self-throttles.
export function fare(amt) {
  if (!ctx || !on) return;
  const now = performance.now();
  if (now - lastFareAt < 160) return;
  lastFareAt = now;
  const f = 720 + Math.min(600, Math.log2(1 + Math.max(0, amt)) * 60);
  tone(f, { dur: 0.06, type: 'triangle', gain: 0.11 });
}

// A held major chord, one per era, keyed a step higher each decade.
export function eraSting(idx) {
  const root = [220.0, 246.94, 261.63, 293.66, 329.63][Math.min(4, Math.max(0, idx))];
  tone(root, { dur: 1.6, gain: 0.28, attack: 0.06 });
  tone(root * 1.25, { at: 0.05, dur: 1.5, gain: 0.2, attack: 0.08 });
  tone(root * 1.5, { at: 0.1, dur: 1.4, gain: 0.18, attack: 0.1 });
}

// Low, brief: attention, never alarm — the amber halo's voice.
export function incident() {
  tone(95, { dur: 0.22, type: 'sawtooth', gain: 0.28, lp: 260 });
}
