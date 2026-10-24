/*
 * One frame loop, paused while the tab is hidden. Each frame is told how
 * long since the last, capped, so a tab coming back does not jump.
 */

export type Loop = {
  readonly pause: () => void;
  readonly resume: () => void;
  readonly dispose: () => void;
};

export function loop(frame: (now: number, dt: number) => void): Loop {
  let id = 0;
  let last = 0;
  let paused = false;
  const tick = (now: number) => {
    id = requestAnimationFrame(tick);
    const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 1 / 20);
    last = now;
    frame(now, dt);
  };
  const run = () => {
    if (id !== 0 || paused || document.hidden) return;
    last = 0;
    id = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(id);
    id = 0;
  };
  const visibility = () => (document.hidden ? stop() : run());
  document.addEventListener('visibilitychange', visibility);
  run();
  return {
    pause() {
      paused = true;
      stop();
    },
    resume() {
      paused = false;
      run();
    },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
