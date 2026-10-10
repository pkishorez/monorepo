import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';

/** Laid over the road while the game is paused: the road stands still until Resume. */
export const PausedOverlay = ({
  onResume,
}: {
  readonly onResume: () => void;
}) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 text-center">
    <h2 className="text-lg font-semibold tracking-tight">Paused</h2>
    <Button autoFocus onClick={onResume}>
      Resume <Kbd>P</Kbd>
    </Button>
  </div>
);
