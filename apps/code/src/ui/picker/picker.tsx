import { View } from '@kestack/kabuki/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { useIsMobile } from '@kestack/web-platform/ui/components/hooks/use-mobile';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactElement, ReactNode } from 'react';
import { keys } from '../../keys.ts';
import { build, How, type Spec } from './actor.ts';
import { List } from './list.tsx';
import { opened } from './opening.ts';

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
 * It is drawn in a `Frame`: opened by keys, a centred list; by pointer, a
 * popover by its trigger. On a phone, either way, it fills the screen. Base UI moves no focus as either closes: leaving
 * the Surface puts it back where it was. A Picker closed by a click outside
 * leaves the Surface too.
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
 * Where a Picker is drawn, around its trigger: a popover by it when opened
 * by pointer, a centred list when opened by keys, nothing while `how` is
 * null. The trigger opens it, by pointer.
 */
export function Frame({
  how,
  label,
  trigger,
  onOpen,
  side = 'top',
  align = 'start',
  className,
  children,
}: {
  readonly how: typeof How.Type | null;
  /** What it is called to a screen reader. */
  readonly label: string;
  /** The button it opens from, as an element for Base UI to render; without one, it opens only by keys. */
  readonly trigger?: ReactElement;
  /** Opened by its trigger: the owner Invokes the Picker, by pointer. */
  readonly onOpen?: () => void;
  readonly side?: 'top' | 'bottom';
  readonly align?: 'start' | 'center' | 'end';
  /** The popover's size. */
  readonly className?: string;
  /** The Picker's View. */
  readonly children: ReactNode;
}) {
  const { active } = keys.useSurface('picker');
  // A phone has no room for a popover: the Picker fills the screen.
  const phone = useIsMobile();
  const centred = how === 'keys' || (phone && how === 'pointer');
  const { leave } = keys.useKeyboard();
  const openPicker = useOpen();
  const change = (
    open: boolean,
    details: {
      readonly reason: string;
      readonly cancel: () => void;
      readonly allowPropagation: () => void;
    },
  ) => {
    // Escape goes through the Surface's order instead.
    if (details.reason === 'escape-key') {
      details.cancel();
      details.allowPropagation();
      return;
    }
    if (!open) leave('picker');
    else if (how === null && onOpen !== undefined) openPicker(onOpen);
  };
  return (
    <>
      {trigger !== undefined && (
        <Popover
          open={!phone && how === 'pointer' && active}
          onOpenChange={change}
        >
          <PopoverTrigger render={trigger} />
          <PopoverContent
            side={side}
            align={align}
            finalFocus={false}
            aria-label={label}
            className={cn('w-80 gap-0 overflow-hidden p-0', className)}
          >
            {!phone && how === 'pointer' && children}
          </PopoverContent>
        </Popover>
      )}
      {/*
       * Not modal: the Surface keeps keys and focus in, so leaving it can
       * put focus back at once. Gone with its Picker, never left closing:
       * a closing dialog takes focus back to itself when the page under it
       * changes, as choosing a session does.
       */}
      {centred && (
        <Dialog open={active} onOpenChange={change} modal={false}>
          <DialogContent
            finalFocus={false}
            showCloseButton={phone}
            className="top-1/3 translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg max-md:inset-0 max-md:flex max-md:max-w-none max-md:translate-x-0 max-md:flex-col max-md:rounded-none! max-md:pt-[calc(env(safe-area-inset-top)+3.25rem)] max-md:pb-[env(safe-area-inset-bottom)] max-md:ring-0 max-md:[&_[data-slot=dialog-close]]:top-[calc(env(safe-area-inset-top)+0.5rem)] max-md:[&_[data-slot=dialog-close]]:right-2 max-md:[&_[data-slot=dialog-close]]:size-11"
          >
            <DialogTitle className="sr-only">{label}</DialogTitle>
            {children}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
