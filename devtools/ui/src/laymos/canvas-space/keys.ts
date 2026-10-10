import { useEffect, useState } from 'react';
import { describe, type Binding } from '@kstackz/use-keys';

const arrows: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: '⌫',
};

/** A Binding as a hint line shows it: arrows as arrows. */
export const keyLabel = (binding: Binding) => {
  const written = describe(binding);
  return arrows[written] ?? written;
};

/** The element with focus, kept as state so Actions can follow it. */
export function useActiveElement() {
  const [active, setActive] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => setActive(document.activeElement);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return active;
}

/** Native controls, whose Enter and Space click them. */
export const nativeControls =
  'button, a[href], input, select, textarea, summary';

/** Whether `active` is a control inside `within` that keeps Enter and Space. */
export const keepsKeys = (
  active: Element | null,
  within: Element | null,
  controls = nativeControls,
) =>
  active !== null &&
  within !== null &&
  within.contains(active) &&
  active.closest(controls) !== null;
