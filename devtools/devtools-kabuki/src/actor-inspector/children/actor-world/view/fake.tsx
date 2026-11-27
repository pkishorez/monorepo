import { useId, useState } from 'react';
import { CircleAlertIcon, XIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Value } from '../../../view/shared/index.ts';
import type { Fake } from '../logic/shared/index.ts';
import { ControlButton } from './control.tsx';

const NOW = 'Its state now: the world is never rewound';

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

function Refused({
  refusal,
  onDismiss,
}: {
  readonly refusal: NonNullable<Fake['refusal']>;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-destructive/8 py-2 pr-1.5 pl-2.5 text-xs text-destructive"
    >
      <CircleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 text-pretty">
        <span className="font-medium">{refusal.label} was refused.</span>{' '}
        {refusal.reason}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="-my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-destructive/70 outline-none transition-colors duration-150 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <XIcon aria-hidden className="size-3" />
      </button>
    </div>
  );
}

export function FakeCard({
  fake,
  onRun,
  onDismiss,
}: {
  readonly fake: Fake;
  readonly onRun: (control: string, payload: unknown) => void;
  readonly onDismiss: () => void;
}) {
  const id = useId();
  const flash = useFlash(fake.value);
  return (
    <section
      aria-labelledby={id}
      className="relative overflow-hidden rounded-xl bg-card text-card-foreground shadow-[0_0_0_1px_var(--color-edge),0_1px_2px_rgb(0_0_0/0.04)]"
    >
      {flash > 0 && (
        <motion.span
          key={flash}
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-running ring-inset motion-reduce:hidden"
        />
      )}
      <h3
        id={id}
        title={fake.name}
        className="truncate px-3.5 pt-3 text-[13px] leading-5 font-semibold"
      >
        {fake.label}
      </h3>
      <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 px-3.5 pt-1.5 pb-3 font-mono text-xs leading-5">
        {fake.fields.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="truncate text-muted-foreground">{key}</dt>
            <dd className="flex min-w-0">
              <Value
                value={value}
                label={`${fake.name}.${key}`}
                description={NOW}
              />
            </dd>
          </div>
        ))}
      </dl>
      {fake.refusal && <Refused refusal={fake.refusal} onDismiss={onDismiss} />}
      {fake.controls.length > 0 && (
        <div
          role="group"
          aria-label={`${fake.label} controls`}
          className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2.5"
        >
          {fake.controls.map((control) => (
            <ControlButton
              key={control.name}
              control={control}
              onRun={(payload) => onRun(control.name, payload)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
