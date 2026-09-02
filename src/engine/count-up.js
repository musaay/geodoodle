/**
 * Ease-out quad — starts fast, settles gently, so a counted-up number
 * visibly "lands" on its final value instead of stopping abruptly.
 */
export function easeOutQuad(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

/**
 * Animates a number from 0 to `target` over `duration` ms using
 * easeOutQuad, calling `onUpdate(value)` on every frame with the current
 * rounded integer value. `onTick()` — meant to drive a sound effect — is
 * called at most once every `tickInterval` ms, never every frame, so it
 * stays a handful of ticks rather than a buzz. `onDone()` fires exactly
 * once, right after the final `onUpdate(target)` call.
 *
 * Framework-free: the scheduling primitives (`now`, `requestFrame`,
 * `cancelFrame`) are injectable — defaulting to Date.now/requestAnimationFrame
 * — so this can be driven step-by-step by a test without a DOM or real
 * timers, and without ever touching Web Audio or canvas directly.
 *
 * Returns a `cancel()` function that stops all further callbacks.
 */
export function startCountUp({
  target,
  duration = 1000,
  tickInterval = 70,
  onUpdate = () => {},
  onTick = null,
  onDone = null,
  now = () => Date.now(),
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  const startTime = now();
  let lastTick = startTime;
  let frameId = null;
  let cancelled = false;

  const step = () => {
    if (cancelled) return;
    const elapsed = now() - startTime;
    const t = duration > 0 ? elapsed / duration : 1;
    const finished = t >= 1;
    const value = finished ? target : Math.round(easeOutQuad(t) * target);

    onUpdate(value);

    if (finished) {
      onDone?.();
      return;
    }

    const time = now();
    if (onTick && time - lastTick >= tickInterval) {
      lastTick = time;
      onTick();
    }
    frameId = requestFrame(step);
  };

  frameId = requestFrame(step);

  return () => {
    cancelled = true;
    if (frameId != null) cancelFrame(frameId);
  };
}
