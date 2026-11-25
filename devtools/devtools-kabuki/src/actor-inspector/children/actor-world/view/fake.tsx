import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { Json, Label } from '../../../view/shared/index.ts';
import type { Shown } from '../logic/shared/index.ts';
import { ControlItem } from './control.tsx';

const useFlash = (value: unknown) => {
  const now = JSON.stringify(value) ?? '';
  const [seen, setSeen] = useState(now);
  const [flash, setFlash] = useState(0);
  if (seen !== now) {
    setSeen(now);
    setFlash(flash + 1);
  }
  return flash;
};

export function FakeCard({
  fake,
  onRun,
}: {
  readonly fake: Shown;
  readonly onRun: (control: string, payload: unknown) => void;
}) {
  const id = useId();
  const flash = useFlash(fake.value);
  return (
    <section
      aria-labelledby={id}
      className="@container relative overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs"
    >
      {flash > 0 && (
        <motion.span
          key={flash}
          aria-hidden
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-running/10 ring-2 ring-running ring-inset motion-reduce:hidden"
        />
      )}
      <header className="border-b border-border bg-muted/50 px-3 py-2.5">
        <h3 id={id} className="truncate text-base leading-tight font-semibold">
          {fake.name}
        </h3>
      </header>
      <div className="grid divide-y divide-border @xl:grid-cols-2 @xl:divide-x @xl:divide-y-0">
        <div className="flex min-w-0 flex-col gap-1 px-2 pt-2.5 pb-2">
          <div className="px-1">
            <Label>Controls</Label>
          </div>
          {fake.controls.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Nothing to run: this Fake only shows its state.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {fake.controls.map((control) => (
                <ControlItem
                  key={control.name}
                  control={control}
                  onRun={(payload) => onRun(control.name, payload)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 px-3 pt-2.5 pb-3">
          <Label>State</Label>
          <Json value={fake.value} lines={15} />
        </div>
      </div>
    </section>
  );
}
