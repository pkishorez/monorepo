import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../routes/index.ts';
import { Running, tab } from '../../../parts/index.ts';
import { BillingActor, pages } from './billing.ts';

export const BillingView = View.make(BillingActor, (self) => (
  <div {...self.root} className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex gap-1">
        <Router.Link
          className={tab}
          aria-current={self.props.page._tag === 'Plan' ? 'page' : undefined}
          to={Routes.Settings.Billing.Plan()}
        >
          Plan
        </Router.Link>
        <Router.Link
          className={tab}
          aria-current={
            self.props.page._tag === 'Invoices' ? 'page' : undefined
          }
          to={Routes.Settings.Billing.Invoices()}
        >
          Invoices
        </Router.Link>
      </nav>
      <Running name="meter" count={self.model.reads} />
    </div>
    <pages.View of={self} />
  </div>
));
