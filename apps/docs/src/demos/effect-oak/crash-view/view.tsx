import { useState } from 'react';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { CrashDemo } from './crash-view.js';
import { CrashPanel } from './crash-panel.js';

/*
 * Effect Oak has no crash hook: an Update that throws throws out of `send`,
 * into whoever called it. So this View catches it and keeps the error in
 * React state, outside the Actor and the Log. See ./notes.md.
 */
export const CrashDemoView = View.make(CrashDemo, ({ send }) => {
  const [crash, setCrash] = useState<Error | null>(null);
  if (crash) return <CrashPanel error={crash} />;
  const crashOn = () => {
    try {
      send({ _tag: 'ClickedCrash' });
    } catch (error) {
      setCrash(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return (
    <div className="flex size-full items-center justify-center">
      <Button variant="destructive" size="lg" onClick={crashOn}>
        Crash
      </Button>
    </div>
  );
});
