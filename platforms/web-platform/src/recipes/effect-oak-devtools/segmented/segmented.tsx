import { motion } from 'motion/react';

/**
 * A row of tabs on a muted track, the one chosen raised on a card that
 * slides to it. `id` names the card, so two of these never share one.
 */
export const Segmented = <Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: Value;
  readonly options: ReadonlyArray<{
    readonly value: Value;
    readonly label: string;
  }>;
  readonly onChange: (value: Value) => void;
}) => (
  <div
    role="tablist"
    aria-label={label}
    className="flex rounded-lg bg-muted p-0.5"
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={value === option.value}
        onClick={() => onChange(option.value)}
        className="relative h-7 rounded-md px-3 text-[13px] whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-selected:text-foreground"
      >
        {value === option.value && (
          <motion.span
            layoutId={id}
            className="absolute inset-0 rounded-md bg-background shadow-sm"
            transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
          />
        )}
        <span className="relative">{option.label}</span>
      </button>
    ))}
  </div>
);
