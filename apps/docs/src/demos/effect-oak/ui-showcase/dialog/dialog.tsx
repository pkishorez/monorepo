import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { focusFirstIn, focusId } from '../focus/index.js';
import { Picks, reportPick } from '../picks/index.js';
import { DialogFrame } from './frame.js';
import { idsOf } from './options.js';
import type { Options } from './options.js';

/*
 * A modal dialog as an Actor: open or closed, plus the button that opens it.
 *
 * Open is Model data, not a State. Each State is drawn by its own keyed
 * component (blocker 11), so a Closed → Open Transition would remount the
 * trigger, and focus could not go back to it on closing.
 *
 * The Dialog owns its trigger because nothing else could open it: a parent
 * cannot send its Child a Message (blocker 14). Opening focuses the first
 * button in the panel, closing focuses the trigger again; both are
 * Commands. An action closes the dialog and reports its value up through
 * Picks. Escape, Close and a click on the backdrop close it without
 * reporting.
 *
 * A nested dialog is a Child of the outer one, drawn inside its panel. It
 * lives as long as the outer Actor, not only while it is open, since open
 * is Model data. It needs its own factory:
 * one generic over the inner Actor does not compile (see notes, blocker 21).
 */

const shape = {
  requires: { picks: Picks },
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Schema.TaggedUnion({
    ClickedTrigger: {},
    Dismissed: {},
    ChoseAction: { value: Schema.String },
  }),
};

const behavior = (options: Options) => {
  const ids = idsOf(options);
  return {
    init: () => ({ model: { open: false } }),
    update: {
      ClickedTrigger: () => ({
        model: { open: true },
        command: focusFirstIn(ids.panel),
      }),
      Dismissed: (
        _: unknown,
        { model }: { readonly model: { readonly open: boolean } },
      ) =>
        model.open
          ? { model: { open: false }, command: focusId(ids.trigger) }
          : {},
      ChoseAction: (
        { value }: { readonly value: string },
        { model }: { readonly model: { readonly open: boolean } },
      ) =>
        model.open
          ? {
              model: { open: false },
              command: Effect.all(
                [reportPick(options.id, value), focusId(ids.trigger)],
                {
                  concurrency: 'unbounded',
                  discard: true,
                },
              ),
            }
          : {},
    },
  };
};

/** A dialog with an action or two. */
export const makeDialog = (options: Options) => {
  const Dialog = Actor.make(`Dialog(${options.id})`, shape).build(
    behavior(options),
  );

  const DialogView = View.make(Dialog, ({ model, send }) => (
    <DialogFrame
      options={options}
      open={model.open}
      onOpen={() => send({ _tag: 'ClickedTrigger' })}
      onDismiss={() => send({ _tag: 'Dismissed' })}
      onChoose={(value) => send({ _tag: 'ChoseAction', value })}
    />
  ));

  return { Dialog, DialogView };
};

/** A dialog whose panel opens a second dialog, its Child. */
export const makeNestedDialog = (options: Options, inner: Options) => {
  const { Dialog: Inner, DialogView: InnerView } = makeDialog(inner);

  const Dialog = Actor.make(`Dialog(${options.id})`, {
    ...shape,
    children: { inner: Inner },
  }).build(behavior(options));

  const DialogView = View.make(Dialog, ({ model, children, send }) => (
    <DialogFrame
      options={options}
      open={model.open}
      onOpen={() => send({ _tag: 'ClickedTrigger' })}
      onDismiss={() => send({ _tag: 'Dismissed' })}
      onChoose={(value) => send({ _tag: 'ChoseAction', value })}
    >
      <InnerView node={children.inner} />
    </DialogFrame>
  ));

  return { Dialog, DialogView };
};
