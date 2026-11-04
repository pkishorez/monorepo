import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Settings with a versioned theme inside it. Each carries its own version.
 * Under the card, Theme's versions: its v2 appears, lit in the accent.
 * A read then upgrades only the theme, from 'night' at v1 to 'dark' at
 * v2, and the settings around it stay v1. Last, the settings card lights:
 * its version has not moved, yet what it reads as has changed, a
 * transitive change. Theme's v2 keeps its room from the start.
 */

type Step = {
  readonly released: boolean;
  readonly upgraded: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    released: false,
    upgraded: false,
    caption: 'Settings is at v1 and holds a theme. Each keeps its own version.',
  },
  {
    released: true,
    upgraded: false,
    caption: 'Theme gets a v2: free text becomes one of two words.',
  },
  {
    released: true,
    upgraded: true,
    caption:
      "A read upgrades the theme on its own: 'night' becomes 'dark', at v2.",
  },
  {
    released: true,
    upgraded: true,
    caption:
      'Settings still says v1, yet what it reads as has changed: a transitive change.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

function Badge({ value }: { readonly value: string }) {
  return (
    <span className="inline-grid rounded bg-foreground px-1 font-mono text-[10px] text-background">
      <Roll value={value} />
    </span>
  );
}

export function NestedPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="relative w-full max-w-64 rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-2 flex items-center gap-1.5 text-[12px]">
            <span className="font-medium">Settings</span>
            <Badge value="v1" />
          </p>
          <dl className="space-y-1.5 font-mono text-[11px]">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">language</dt>
              <dd>'en'</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">theme</dt>
              <dd className="relative flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5">
                <Roll value={now.upgraded ? "'dark'" : "'night'"} />
                <Badge value={now.upgraded ? 'v2' : 'v1'} />
                <Flash {...(step === 2 ? { at: round * 10 + 2 } : {})} />
              </dd>
            </div>
          </dl>
          <Flash {...(step === 3 ? { at: round * 10 + 3 } : {})} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Theme's versions
          <span className="rounded border border-border px-1 font-mono text-[10px]">
            v1
          </span>
          <motion.span
            initial={false}
            animate={
              now.released
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.9 }
            }
            transition={now.released ? ENTER : EXIT}
            aria-hidden={!now.released}
            className={`rounded border px-1 font-mono text-[10px] transition-colors duration-700 ${step === 1 ? 'border-(--field-accent) text-(--field-accent)' : 'border-border'}`}
          >
            v2
          </motion.span>
        </p>
      </div>
    </Walkthrough>
  );
}
