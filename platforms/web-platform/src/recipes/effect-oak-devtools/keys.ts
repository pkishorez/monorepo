import { useEffect, useState } from 'react';
import type { Inspection } from './inspection/index.ts';

/**
 * Keys anywhere on the page, unless typing or already used: Space switches
 * live and the Step shown last; ↑ ↓ move one Step along the Branch in view.
 */
export const useKeys = (inspection: Inspection) => {
  const [last, setLast] = useState<Inspection['step'] | null>(null);
  if (!inspection.live && inspection.step !== last) setLast(inspection.step);
  const toggle = inspection.live
    ? () => inspection.show(last ?? inspection.view.at(-1) ?? 'init')
    : inspection.goLive;
  // A key anywhere on the page needs a window listener, added and removed.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.matches(
          'input, textarea, select, [role=separator], [role=slider], [role=listbox], [role=menu] *',
        )
      )
        return;
      if (event.key === 'ArrowUp') inspection.move(1);
      else if (event.key === 'ArrowDown') inspection.move(-1);
      else if (event.key === ' ' && !event.repeat && !target.matches('button'))
        toggle();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, inspection]);
};
