import { Kbd, KbdGroup } from '@kstackz/ui-toolkit/components/ui/kbd';
import { cn } from '@kstackz/ui-toolkit/utils';
import type { Binding, Shortcut } from '@kstackz/use-keys';
import { mac } from './bindings.ts';

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Escape: 'Esc',
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

/** A Binding's keys, step by step: `G` then `G`, or `⌘` `K`. */
export function BindingKeys(props: {
  readonly binding: Binding;
  readonly muted?: boolean;
}) {
  const steps =
    props.binding.type === 'shortcut' ? [props.binding] : props.binding.steps;
  return (
    <KbdGroup className={cn(props.muted && 'line-through opacity-50')}>
      {steps.map((step, i) => (
        <KbdGroup key={i}>
          {i > 0 && <span className="text-xs text-muted-foreground">then</span>}
          {labels(step).map((label) => (
            <Kbd key={label}>{label}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </KbdGroup>
  );
}

/** The Surface an Action belongs to, or `Global`. */
export const surfaceOf = (id: string) =>
  id.split('.').slice(0, -1).join('.') || 'Global';
