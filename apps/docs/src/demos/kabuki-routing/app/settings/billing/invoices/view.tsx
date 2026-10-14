import { Route } from '@kestack/kabuki/routing';
import { Card } from '../../../../parts/index.ts';
import { INVOICES, Invoices } from './invoices.ts';

export const InvoicesView = Route.view(Invoices, ({ model, send, root }) => (
  <div {...root}>
    <Card>
      <ul className="flex flex-col divide-y divide-border text-[13px]">
        {INVOICES.map((invoice) => (
          <li key={invoice.id}>
            <button
              type="button"
              onClick={() => send({ _tag: 'Toggled', id: invoice.id })}
              className="flex w-full justify-between py-2 text-left"
            >
              <span>{invoice.month}</span>
              <span className="tabular-nums">€{invoice.amount}</span>
            </button>
            {model.open === invoice.id && (
              <p className="pb-2 text-xs text-muted-foreground">
                Paid by card ending 4242.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  </div>
));
