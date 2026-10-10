import type { ReactNode } from 'react';
import type { AppRuntime } from 'effect-oak/react';
import { Dock } from './dock/index.ts';
import { useInspection } from './inspection/index.ts';
import { useKeys } from './keys.ts';
import { LiveDot } from './live-dot.tsx';
import { Panel } from './panel.tsx';
import { Peek } from './peek.tsx';

/*
 * The Effect Oak devtools around an app, from its runtime (`App.useRuntime()`).
 *
 * 1. Inspect  one Inspection: the Branch in view, the Step shown, the
 *             Instance picked. Space and ↑ ↓ work anywhere on the page.
 * 2. Frame    the app fills the space; while a Step is shown, or the app is
 *             stopped, it can't be used.
 * 3. Dock     the panel docks beside it, or peeks from the bottom on a phone
 *             with the Step shown and ↑ ↓.
 */
export function EffectOakDevtools({
  runtime,
  limit = 50,
  children,
}: {
  readonly runtime: AppRuntime;
  /** How many of the newest Messages the Timeline shows at first; `null` for all. */
  readonly limit?: number | null;
  /** The app. */
  readonly children: ReactNode;
}) {
  // 1. Inspect
  const inspection = useInspection(runtime, limit);
  useKeys(inspection);

  return (
    <Dock
      label="Devtools"
      // 2. Frame
      content={
        <div inert={!inspection.live || !runtime.running} className="h-full">
          {children}
        </div>
      }
      // 3. Dock
      panel={(fold) => <Panel inspection={inspection} fold={fold} />}
      peek={(raise) => <Peek inspection={inspection} onOpen={raise} />}
      folded={<LiveDot inspection={inspection} />}
    />
  );
}
