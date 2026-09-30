/** Where a Page Turn's target stands: not asked for, on its way, ready or failed. */
export type Load = 'idle' | 'loading' | 'ready' | 'failed';

type Entry = {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly at: number;
};

// How long a finished load still counts, as the router's preload cache does.
const FRESH = 30_000;

/**
 * One load per target page, shared by every turn toward it: a turn that
 * starts while its target is loading, or loaded in the last 30 s, uses that
 * load; a failed or older one runs again. A load that takes longer than
 * `timeout` ms has failed.
 */
export const createLoads = (timeout: number, onChange: () => void) => {
  const entries = new Map<string, Entry>();

  const status = (to: string): Load => entries.get(to)?.status ?? 'idle';

  const ensure = (to: string, run: () => Promise<void>): void => {
    const found = entries.get(to);
    if (
      found?.status === 'loading' ||
      (found?.status === 'ready' && Date.now() - found.at < FRESH)
    ) {
      return;
    }
    const entry: Entry = { status: 'loading', at: Date.now() };
    entries.set(to, entry);
    onChange();

    const settle = (next: Entry['status']) => {
      if (entries.get(to) !== entry) return;
      entries.set(to, { status: next, at: Date.now() });
      onChange();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), timeout);
    });
    Promise.race([run(), late])
      .then(
        () => settle('ready'),
        () => settle('failed'),
      )
      .finally(() => clearTimeout(timer));
  };

  return { status, ensure };
};
