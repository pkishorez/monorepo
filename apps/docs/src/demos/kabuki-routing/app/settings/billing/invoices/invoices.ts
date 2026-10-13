import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Routes } from '../../../../routes/index.ts';

export const INVOICES = [
  { id: 'inv-3', month: 'March', amount: 120 },
  { id: 'inv-2', month: 'February', amount: 120 },
  { id: 'inv-1', month: 'January', amount: 90 },
] as const;

/** The invoices page, the third level down: which invoice is open is its own business. */
export const InvoicesActor = Actor.make('Invoices', {
  props: Routes.Settings.Billing.Invoices.props,
  model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({ Toggled: { id: Schema.String } }),
}).build({
  init: () => ({ model: { open: null } }),
  on: {
    Toggled: ({ id }, { model }) => ({
      model: { open: model.open === id ? null : id },
    }),
  },
});
