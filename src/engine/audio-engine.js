import { RANKS } from '../data/levels.js';

/**
 * AudioEngine - short sound effects synthesized at runtime with the Web
 * Audio API. No audio files: works offline (PWA), in the portal build, and
 * adds zero asset weight.
 *
 * The AudioContext is created lazily, the first time any play*() function
 * is actually called (and resumed if a browser suspended it). Every call
 * happens after the user has already interacted with the page — usually
 * inside the gesture handler itself (click/pointerdown), which satisfies
 * autoplay-unlock rules (iOS Safari included) directly. The one exception
 * is blind mode's timer expiry auto-submitting to the result screen, which
 * isn't itself a gesture — but by that point the player has already drawn
 * (or at least interacted with) the page, so the browser's activation
 * state still allows audio; there's nothing to special-case here.
 * If creation/resume ever fails, the engine quietly gives up rather than
 * throwing or spamming the console on every subsequent call.
 */

let ctx = null;
let unavailable = false;
let soundEnabled = true;

/** Mirror of GameState's persisted preference — kept in sync by GameState
 *  so every play*() can cheaply bail out without touching AudioContext. */
export function setSoundEnabled(enabled) {
  soundEnabled = !!enabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

function getContext() {
  if (unavailable) return null;
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AudioContextClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioContextClass) {
    unavailable = true;
    return null;
  }
  try {
    ctx = new AudioContextClass();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch (e) {
    unavailable = true;
    return null;
  }
}

/**
 * Schedule one short tone. `gain` is linear (~0.25 ≈ -12dB), ramped up over
 * `attack` seconds then decayed exponentially to (near) silence by
 * `duration`, so notes never click or clip. `when` offsets the start time
 * for scheduling a short sequence (e.g. the result fanfare).
 */
function scheduleTone(audioCtx, { freq, duration = 0.08, type = 'sine', gain = 0.25, attack = 0.005, sweepTo = null, when = 0 }) {
  const start = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);

  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playTone(opts) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  scheduleTone(audioCtx, opts);
}

/**
 * True for the top 2 ranks in RANKS (by minScore) — e.g. Map Master and
 * Modern Piri Reis today — regardless of how many ranks exist or their
 * exact score cutoffs. Pure function, no AudioContext involved, so it's
 * safe to unit test DOM-free.
 */
export function isHighRank(rank) {
  if (!rank || !rank.name) return false;
  const topTwo = Object.values(RANKS)
    .slice()
    .sort((a, b) => b.minScore - a.minScore)
    .slice(0, 2)
    .map((r) => r.name);
  return topTwo.includes(rank.name);
}

/** Soft tick on pointerdown, when a stroke begins. */
export function playStrokeStart() {
  if (!soundEnabled) return;
  playTone({ freq: 520, duration: 0.04, type: 'sine', gain: 0.15 });
}

/** Neutral click for buttons: hint button, mode/tool buttons, etc. */
export function playClick() {
  if (!soundEnabled) return;
  playTone({ freq: 660, duration: 0.035, type: 'triangle', gain: 0.18 });
}

/** Small rising blip when a hint is used. */
export function playHint() {
  if (!soundEnabled) return;
  playTone({ freq: 440, sweepTo: 880, duration: 0.06, type: 'sine', gain: 0.2 });
}

/** Clear confirm sound for the Submit action. */
export function playSubmit() {
  if (!soundEnabled) return;
  playTone({ freq: 500, sweepTo: 760, duration: 0.16, type: 'sine', gain: 0.25 });
}

/** Short repeated tick — for a score count-up animation to call once per step. */
export function playTick() {
  if (!soundEnabled) return;
  playTone({ freq: 900, duration: 0.02, type: 'square', gain: 0.12 });
}

function playFanfare(audioCtx) {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    scheduleTone(audioCtx, { freq, type: 'triangle', gain: 0.22, duration: 0.35, when: i * 0.1 });
  });
}

/**
 * Result reveal sound: a short fanfare for the top 2 ranks, a softer
 * neutral tone otherwise. Call once on the result screen (also serves as
 * the score reveal's stand-in until a count-up animation exists to drive
 * playTick() itself).
 */
export function playResult(rank) {
  if (!soundEnabled) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (isHighRank(rank)) {
    playFanfare(audioCtx);
  } else {
    scheduleTone(audioCtx, { freq: 380, sweepTo: 300, duration: 0.25, type: 'sine', gain: 0.2 });
  }
}
