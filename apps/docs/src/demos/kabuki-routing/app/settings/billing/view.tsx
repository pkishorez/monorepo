import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { router } from '../../../routes/index.ts';
import { Running, tab } from '../../../parts/index.ts';
import { InvoicesView } from './invoices/index.ts';
import { BillingLive } from './billing.ts';
import { Plan } from './plan.tsx';

export const BillingView = View.make(BillingLive, (self) => {
  const { page } = self.props.route;
  return (
    <div {...self.root} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1">
          <Router.Link
            className={tab}
            aria-current={page ? undefined : 'page'}
            to={router.Settings.Billing()}
          >
            Plan
          </Router.Link>
          <Router.Link
            className={tab}
            aria-current={page?._tag === 'Invoices' ? 'page' : undefined}
            to={router.Settings.Billing.Invoices()}
          >
            Invoices
          </Router.Link>
        </nav>
        <Running name="meter" count={self.model.reads} />
      </div>
      {page ? null : <Plan />}
      {self.children.Invoices && (
        <InvoicesView instance={self.children.Invoices} />
      )}
    </div>
  );
});
