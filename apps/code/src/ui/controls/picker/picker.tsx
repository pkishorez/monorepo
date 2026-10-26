import { View } from '@kestack/kabuki/react';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { keys } from '../../../device/account/connections/layout/commands.ts';
import { build, How, type Spec } from './actor.ts';
import { ByTrigger, Centred } from './shape/keyboard.tsx';
import { List } from './list/list.tsx';
import { opened } from './shape/opening.ts';
import {
  type Change,
  DrawnIn,
  howOf,
  type Mode,
  shapeOf,
} from './shape/shape.ts';
import { Touch } from './shape/touch.tsx';

/*
 * The Picker: one way to choose something, as a stack of Steps. A feature
 * makes its own with `make`, naming each Step: its rows, from what the
 * owner hands it as Props or loaded through the owner, and the Step a row
 * opens next. The owner keeps whether it is open: it Invokes the Picker
 * while it is, with how it was opened and the Step it opens at as Input,
 * Provides `owner({ done })` to hear what was chosen, and stops it then.
 * Whoever opens it does so through `useOpen`, which enters the `picker`
 * Surface in the same handler, so a Picker opened over another takes the
 * Surface from it.
 *
 * It is drawn in a `Frame`, as the input that opened it asks, whatever
 * the device: opened by keys, a centred list, its search focused; by a
 * mouse, a popover by its trigger; by a touch, as any click on its
 * trigger on a device with no keyboard and no mouse is, in the Picker
 * Mode its opener chose, a Drawer, or a Sheet, a tall Drawer with a
 * search, nothing focused: its search waits to be tapped. How
 * it was opened stays while it is open. The rest of the
 * screen dims behind it either way. Focus moves as the Surface says, and
 * a Picker closed by a tap or click outside, or a swipe, leaves the
 * Surface too.
 */

/** A Picker, from its Steps: its actor and View, and the Layer its owner Provides. */
export const make = <const Name extends string, P>(
  name: Name,
  spec: Spec<P>,
) => {
  const { Live, owner } = build(name, spec);
  const PickerView = View.make(Live, ({ model, props, send }) => (
    <List spec={spec} model={model} props={props} send={send} />
  ));
  return { Live, View: PickerView, owner };
};

/** How a Picker was opened, for an owner's Model. */
export { How };

/**
 * Opens a Picker: `open` asks its owner to Invoke it, then the `picker`
 * Surface is entered, in the same handler.
 */
export const useOpen = () => {
  const { enter } = keys.useKeyboard();
  return (open: () => void) => {
    opened();
    open();
    enter('picker');
  };
};

/**
 * Where a Picker is drawn, around its trigger, as `how` it was opened
 * asks: a centred list by keys, a popover by its trigger by a mouse, its
 * Picker Mode, `mode`, by a touch. Nothing while `how` is null. The
 * trigger opens it, saying whether the keys, a mouse or a touch did.
 */
export function Frame({
  how,
  mode,
  label,
  trigger,
  onOpen,
  side = 'top',
  align = 'start',
  className,
  tall = false,
  held = false,
  children,
}: {
  readonly how: typeof How.Type | null;
  /** Its Picker Mode, when opened by touch: a few choices in a Drawer, a list worth searching in a Sheet. */
  readonly mode: Mode;
  /** What it is called to a screen reader, and the title of its first Step on touch. */
  readonly label: string;
  /** The button it opens from, as an element for Base UI to render; without one, it opens only by keys. */
  readonly trigger?: ReactElement;
  /** Opened by its trigger: the owner Invokes the Picker, as the keys, a mouse or a touch opened it. */
  readonly onOpen?: (how: typeof How.Type) => void;
  readonly side?: 'top' | 'bottom';
  readonly align?: 'start' | 'center' | 'end';
  /** The popover's size. */
  readonly className?: string;
  /**
   * Its Drawer, opened by touch, three quarters of the screen tall with a
   * search, for a long list: it never changes height as its rows load.
   */
  readonly tall?: boolean;
  /**
   * Its owner shows something over it, such as a new session: drawn by
   * touch, it stays open while another Picker over that comes and goes,
   * whichever has the keys, and takes them back once that is gone.
   */
  readonly held?: boolean;
  /** The Picker's View. */
  readonly children: ReactNode;
}) {
  const { active } = keys.useSurface('picker');
  const { touch, keyboard } = useDevice();
  const shape = shapeOf(how, mode);
  // Once drawn by touch, its layer stays, closed, so a Drawer can slide away.
  const touched = useRef(false);
  if (shape === mode) touched.current = true;
  const { leave, enter } = keys.useKeyboard();
  // Back from what was over it, it has the keys again.
  const wasHeld = useRef(held);
  useEffect(() => {
    if (wasHeld.current && !held && shape === mode && !active) enter('picker');
    wasHeld.current = held;
  }, [held]);
  const openPicker = useOpen();
  const change: Change = (open, details) => {
    // Escape goes through the Surface's order instead.
    if (details.reason === 'escape-key') {
      details.cancel();
      details.allowPropagation();
      return;
    }
    // A tap on what is over it, such as another Picker, is no tap outside it.
    if (!open && held && details.reason === 'outside-press')
      return details.cancel();
    if (!open) leave('picker');
    else if (how === null && onOpen !== undefined) {
      const by = howOf(details.event, touch && !keyboard);
      openPicker(() => onOpen(by));
    }
  };
  const drawn = (as: typeof shape) => (shape === as ? children : null);
  return (
    <DrawnIn value={{ shape: shape ?? 'list', label, held }}>
      {trigger !== undefined && (
        <ByTrigger
          open={shape === 'popover' && active}
          onOpenChange={change}
          label={label}
          trigger={trigger}
          side={side}
          align={align}
          className={className}
        >
          {drawn('popover')}
        </ByTrigger>
      )}
      {shape === 'list' && (
        <Centred open={active} onOpenChange={change} label={label}>
          {children}
        </Centred>
      )}
      {(touch || touched.current) && (
        <Touch
          mode={mode}
          tall={tall}
          open={shape === mode && (active || held)}
          onOpenChange={change}
          label={label}
        >
          {drawn(mode)}
        </Touch>
      )}
    </DrawnIn>
  );
}
