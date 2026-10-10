import { Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import {
  ANNOUNCED,
  combobox,
  dialog,
  disclosure,
  disclosurePreview,
  listbox,
  listboxMulti,
  menu,
  notifications,
  settings,
  tabsHorizontal,
  tabsVertical,
  tooltip,
  tooltipNoDelay,
} from './components.js';
import { Page } from './pages.js';
import { Picks } from './picks/index.js';
import { expireLater, SAMPLES, Toast, Variant } from './toasts/index.js';

/*
 * A showcase of stateful UI components, each one an Actor with its own View.
 *
 * Every component is a Child of the showcase for the whole app; the page
 * on show is Model data and the View draws only that page's Children. Each
 * component owns its state and reports what was picked up through Picks, a
 * Request the showcase Provides; the showcase keeps the latest report from
 * each and draws them as "What the parent heard". Dialog and menu choices
 * also become toasts, which live here as a list in the Model.
 */

export const UiShowcase = Actor.make('UiShowcase', {
  model: Schema.Struct({
    page: Page,
    heard: Schema.Record(Schema.String, Schema.String),
    toasts: Schema.Array(Toast),
    nextToastId: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    ChosePage: { page: Page },
    Picked: { source: Schema.String, value: Schema.String },
    ClickedShowToast: { variant: Variant, sticky: Schema.Boolean },
    ClickedDismissAll: {},
    DismissedToast: { id: Schema.Number },
    ExpiredToast: { id: Schema.Number },
  }),
  provides: [Picks],
  children: {
    dialog: dialog.Dialog,
    settings: settings.Dialog,
    menu: menu.Menu,
    tabsHorizontal: tabsHorizontal.Tabs,
    tabsVertical: tabsVertical.Tabs,
    listbox: listbox.Listbox,
    listboxMulti: listboxMulti.Listbox,
    combobox: combobox.Combobox,
    disclosure: disclosure.Disclosure,
    disclosurePreview: disclosurePreview.Disclosure,
    notifications: notifications.Switch,
    tooltip: tooltip.Tooltip,
    tooltipNoDelay: tooltipNoDelay.Tooltip,
  },
}).build({
  init: () => ({
    model: { page: 'Dialog', heard: {}, toasts: [], nextToastId: 0 },
  }),
  provides: (self) =>
    Layer.succeed(Picks, {
      report: (source, value) => self.send({ _tag: 'Picked', source, value }),
    }),
  update: {
    ChosePage: ({ page }, { model }) => ({ model: { ...model, page } }),
    Picked: ({ source, value }, { model }) => {
      const heard = { ...model.heard, [source]: value };
      const title = ANNOUNCED[source];
      return title === undefined
        ? { model: { ...model, heard } }
        : show(
            { ...model, heard },
            {
              variant: 'Info',
              title: `${title}: ${value}`,
              description: `Reported up by ${source}.`,
              sticky: false,
            },
          );
    },
    ClickedShowToast: ({ variant, sticky }, { model }) =>
      show(model, { variant, sticky, ...SAMPLES[variant] }),
    ClickedDismissAll: (_, { model }) => ({ model: { ...model, toasts: [] } }),
    DismissedToast: ({ id }, { model }) => ({ model: without(model, id) }),
    ExpiredToast: ({ id }, { model }) => ({ model: without(model, id) }),
  },
});

type Model = {
  readonly page: Page;
  readonly heard: { readonly [source: string]: string };
  readonly toasts: ReadonlyArray<typeof Toast.Type>;
  readonly nextToastId: number;
};

function show(model: Model, toast: Omit<typeof Toast.Type, 'id'>) {
  const id = model.nextToastId;
  return {
    model: {
      ...model,
      toasts: [...model.toasts, { id, ...toast }],
      nextToastId: id + 1,
    },
    command: toast.sticky ? undefined : expireLater(id),
  };
}

/** The Model without the toast with this id; the same if it is already gone. */
function without(model: Model, id: number): Model {
  return { ...model, toasts: model.toasts.filter((toast) => toast.id !== id) };
}
