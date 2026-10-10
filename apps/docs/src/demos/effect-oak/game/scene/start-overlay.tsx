import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';

/** The welcome card laid over the road: the name, the keys, and Start. */
export const StartOverlay = ({ onStart }: { readonly onStart: () => void }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 text-center">
    <h2 className="text-lg font-semibold tracking-tight">Road</h2>
    <p className="text-sm text-muted-foreground">
      Steer with <Kbd>←</Kbd> <Kbd>→</Kbd>, pause with <Kbd>P</Kbd>
    </p>
    <Button autoFocus onClick={onStart}>
      Start
    </Button>
  </div>
);
