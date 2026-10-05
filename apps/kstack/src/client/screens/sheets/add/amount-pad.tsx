import { Delete } from '@kstackz/ui-toolkit/lucide';

const KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
] as const;

/** A key on the Amount Pad: a digit, the point, or back. */
export type PadKey = (typeof KEYS)[number];

/** Whole digits an amount may have: up to 9,999,999. */
const WHOLE = 7;

/**
 * The amount after one key: at most one point, two digits after it, no
 * leading zeros, and no more than {@link WHOLE} whole digits. A key that
 * would break a rule does nothing.
 */
export const press = (typed: string, key: PadKey): string => {
  if (key === 'back') return typed.slice(0, -1);
  const point = typed.indexOf('.');
  if (key === '.') {
    if (point !== -1) return typed;
    return typed === '' ? '0.' : `${typed}.`;
  }
  if (point !== -1) return typed.length - point > 2 ? typed : typed + key;
  if (typed === '0') return key;
  return typed.length >= WHOLE ? typed : typed + key;
};

/**
 * The Amount Pad's keys, three by four, so the phone's own keyboard never
 * opens for the amount.
 */
export function AmountPad(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'back' ? 'Delete the last digit' : undefined}
          onClick={() => props.onChange(press(props.value, key))}
          className="focus-ring grid h-13 touch-manipulation place-items-center rounded-xl bg-muted/50 text-2xl font-medium tabular-nums transition-[background-color,scale] duration-100 ease-out select-none active:scale-[0.97] active:bg-accent [&_svg]:size-6"
        >
          {key === 'back' ? <Delete /> : key}
        </button>
      ))}
    </div>
  );
}
