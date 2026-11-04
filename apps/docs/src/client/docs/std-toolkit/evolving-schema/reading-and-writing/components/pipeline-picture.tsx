import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * One read, step by step, left to right: the stored row and the version it
 * says; decoding at that version; each migration after it, one at a time;
 * and the latest value handed to your code. One stage is outlined at a
 * time, and under them the task gains the field that stage gave it, lit
 * in the accent as it appears. Every field has its line from the start,
 * so the card never grows.
 */

const STAGES = [
  { label: '_v: v1', note: 'read the stamp' },
  { label: 'decode at v1', note: 'v1 fields' },
  { label: 'v1 → v2', note: '+ priority' },
  { label: 'v2 → v3', note: '+ done' },
  { label: 'your code', note: 'the v3 value' },
] as const;

const CAPTIONS = [
  "A read starts with the stored row's _v. This row says v1.",
  "It is decoded at v1: checked against v1's fields, not the latest's.",
  'The migration v1 → v2 runs, and the task gains a priority.',
  'Then v2 → v3 runs, and the task gains done.',
  'Your code gets a v3 task, and never sees which version it came from.',
];

const FIELDS = [
  { name: 'title', value: "'Plan the week'", from: 1 },
  { name: 'priority', value: "'low'", from: 2 },
  { name: 'done', value: 'false', from: 3 },
] as const;

export function PipelinePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-6">
        <ol className="mx-auto grid max-w-xl grid-cols-5 gap-1.5">
          {STAGES.map((stage, index) => (
            <li
              key={stage.label}
              className={`rounded-lg border px-1.5 py-2 text-center transition-colors duration-300 ${index === step ? 'border-foreground bg-background' : 'border-border bg-background/60'}`}
            >
              <p className="font-mono text-[10.5px] leading-4">{stage.label}</p>
              <p className="mt-0.5 text-[10px] leading-3 text-muted-foreground">
                {stage.note}
              </p>
            </li>
          ))}
        </ol>
        <div className="relative mx-auto mt-5 w-fit min-w-48 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-5">
          <p className="mb-0.5 font-sans text-[12px] font-medium">
            Task, as read so far
          </p>
          <div className="grid">
            <motion.p
              initial={false}
              animate={{ opacity: step === 0 ? 1 : 0 }}
              transition={step === 0 ? ENTER : EXIT}
              aria-hidden={step !== 0}
              className="[grid-area:1/1] text-muted-foreground"
            >
              nothing yet
            </motion.p>
            <div className="[grid-area:1/1]">
              {FIELDS.map((field) => {
                const shown = step >= field.from;
                return (
                  <motion.p
                    key={field.name}
                    initial={false}
                    animate={
                      shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }
                    }
                    transition={shown ? ENTER : EXIT}
                    aria-hidden={!shown}
                    className={`whitespace-nowrap transition-colors duration-700 ${step === field.from ? 'text-(--field-accent)' : ''}`}
                  >
                    <span
                      className={
                        step === field.from ? '' : 'text-muted-foreground'
                      }
                    >
                      {field.name}{' '}
                    </span>
                    {field.value}
                  </motion.p>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
