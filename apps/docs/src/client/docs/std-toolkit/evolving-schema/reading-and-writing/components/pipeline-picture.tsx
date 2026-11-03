import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * One read, step by step, left to right: the stored row and the version it
 * says; decoding at that version; each migration after it, one at a time,
 * the task gaining a field at each; and the latest value handed to your
 * code. One stage lights at a time.
 */

const STAGES = [
  { label: '_v: v1', note: 'read the stamp' },
  { label: 'decode at v1', note: 'v1 fields' },
  { label: 'v1 → v2', note: '+ priority' },
  { label: 'v2 → v3', note: '+ done' },
  { label: 'your code', note: 'the v3 value' },
] as const;
const DURATIONS = [1300, 1300, 1500, 1500, 2200];

const FIELDS = [
  { name: 'title', value: "'Plan the week'", from: 1 },
  { name: 'priority', value: "'low'", from: 2 },
  { name: 'done', value: 'false', from: 3 },
] as const;

export function PipelinePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  return (
    <div ref={ref} className="px-4 py-8 sm:px-6">
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
      <div className="mx-auto mt-5 w-fit min-w-48 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-5">
        <p className="mb-0.5 font-sans text-[12px] font-medium">
          Task, as read so far
        </p>
        <AnimatePresence initial={false}>
          {FIELDS.filter((field) => step >= field.from).map((field) => (
            <motion.p
              key={`${round}-${field.name}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 20, transition: ENTER }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              className="overflow-hidden"
            >
              <span className="text-muted-foreground">{field.name} </span>
              {field.value}
            </motion.p>
          ))}
        </AnimatePresence>
        {step === 0 && <p className="text-muted-foreground">nothing yet</p>}
      </div>
    </div>
  );
}
