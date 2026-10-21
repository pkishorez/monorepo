/*
 * What the field says about itself in the console. Warnings and errors
 * always show: a field that is off, or worse than it should be, says why.
 * The step-by-step trace (mount, each shape baked, the first frame) shows
 * only when asked for, with `?debug` in the URL or `localStorage.debug =
 * 'field'`, and every line carries the milliseconds since the field mounted.
 */

const asked = (): boolean => {
  try {
    return (
      new URLSearchParams(window.location.search).has('debug') ||
      (window.localStorage.getItem('debug') ?? '').includes('field')
    );
  } catch {
    return false;
  }
};

export function logger() {
  const on = asked();
  const start = performance.now();
  const at = () => `${Math.round(performance.now() - start)}ms`;
  return {
    on,
    debug: (...what: unknown[]) => {
      if (on) console.info(`[field +${at()}]`, ...what);
    },
    warn: (...what: unknown[]) => console.warn(`[field +${at()}]`, ...what),
    error: (...what: unknown[]) => console.error(`[field +${at()}]`, ...what),
  };
}

export type Log = ReturnType<typeof logger>;
