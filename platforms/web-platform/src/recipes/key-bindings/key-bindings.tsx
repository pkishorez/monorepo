import { Kbd, KbdGroup } from '#components/ui/kbd';
import { cn } from '#lib/utils';
import type { Binding, Shortcut } from '@kstackz/use-keys';

/** Whether this is an Apple device, where `mod` is Cmd. */
const mac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * One recorded key, as a Shortcut: Cmd on a Mac or Ctrl elsewhere becomes
 * `mod`, so the key works on both.
 */
export const recorded = (name: string, held: ReadonlySet<string>): Shortcut => {
  const apple = mac();
  return {
    type: 'shortcut',
    key: name as Shortcut['key'],
    mod: held.has(apple ? 'Meta' : 'Control'),
    ctrl: apple && held.has('Control'),
    alt: held.has('Alt'),
    // A symbol is the character typed, so Shift is part of it.
    shift: held.has('Shift') && /^[a-z]$|^[A-Z]/.test(name),
    meta: !apple && held.has('Meta'),
  };
};

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Escape: 'Esc',
  Space: 'Space',
};

// A Shortcut as its keys read on this platform: ⌘K on a Mac, Ctrl K elsewhere.
const labels = (step: Shortcut) => {
  const apple = mac();
  return [
    step.mod !== false && (apple ? '⌘' : 'Ctrl'),
    step.ctrl !== false && (apple ? '⌃' : 'Ctrl'),
    step.alt !== false && (apple ? '⌥' : 'Alt'),
    step.shift !== false && '⇧',
    step.meta !== false && (apple ? '⌘' : 'Win'),
    KEY_NAMES[step.key] ?? step.key.toUpperCase(),
  ].filter((label) => label !== false);
};

/**
 * A Binding's keys, step by step: `G` `G`, or `⌘` `K`. A hint shows only
 * where there is a keyboard and Keys are on; `always` shows it anyway, as
 * Settings lists every key.
 */
export function BindingKeys(props: {
  readonly binding: Binding;
  readonly always?: boolean;
  readonly className?: string;
}) {
  const steps =
    props.binding.type === 'shortcut' ? [props.binding] : props.binding.steps;
  return (
    <KbdGroup
      className={cn(
        'gap-0.5',
        props.always !== true && 'hidden keys:inline-flex',
        props.className,
      )}
    >
      {steps.map((step, i) => (
        <KbdGroup key={i} className="gap-0.5">
          {labels(step).map((label) => (
            <Kbd key={label}>{label}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </KbdGroup>
  );
}
