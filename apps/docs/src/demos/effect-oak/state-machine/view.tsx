import type { ReactNode } from 'react';
import type { Snapshot } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Checkbox } from '@kstackz/web-platform/components/checkbox';
import { Label } from '@kstackz/web-platform/components/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@kstackz/web-platform/components/radio-group';
import { PromoCodeView } from './promo/index.js';
import { Checkout, isReviewReady } from './state-machine.js';
import { editionName, editionPrice, OrderSummary } from './summary/index.js';

type Send = Snapshot<typeof Checkout>['send'];

const STEPS = ['Cart', 'Shipping', 'Payment', 'Review'] as const;

/** Which steps are done, current, skipped or ahead, as a row of labels. */
const Progress = ({
  current,
  shipping,
}: {
  readonly current: number;
  readonly shipping: boolean;
}) => (
  <ol className="flex gap-2 text-xs">
    {STEPS.map((step, index) => {
      const skipped = step === 'Shipping' && !shipping;
      const tone = skipped
        ? 'border-transparent text-muted-foreground/50 line-through'
        : index === current
          ? 'border-primary text-foreground'
          : index < current
            ? 'border-transparent text-foreground'
            : 'border-transparent text-muted-foreground';
      return (
        <li key={step} className={`flex-1 border-b-2 pb-1 ${tone}`}>
          {index + 1}. {step}
        </li>
      );
    })}
  </ol>
);

/** One step's frame: progress, title, body and actions, with the summary beside it. */
const Step = ({
  current,
  shipping,
  discount = null,
  title,
  children,
  actions,
}: {
  readonly current: number;
  readonly shipping: boolean;
  readonly discount?: {
    readonly code: string;
    readonly percentOff: number;
  } | null;
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[1fr_16rem]">
      <section className="flex flex-col gap-5">
        {current >= 0 && <Progress current={current} shipping={shipping} />}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </section>
      <OrderSummary shipping={shipping} discount={discount} />
    </div>
  </div>
);

const Cancel = ({ send }: { readonly send: Send }) => (
  <Button variant="ghost" onClick={() => send({ _tag: 'ClickedCancel' })}>
    Cancel checkout
  </Button>
);

const Back = ({ send }: { readonly send: Send }) => (
  <Button variant="outline" onClick={() => send({ _tag: 'ClickedBack' })}>
    Back
  </Button>
);

const Continue = ({
  send,
  label = 'Continue',
}: {
  readonly send: Send;
  readonly label?: string;
}) => (
  <Button onClick={() => send({ _tag: 'ClickedContinue' })}>{label}</Button>
);

const Toggle = ({
  id,
  checked,
  onChange,
  children,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: ReactNode;
}) => (
  <div className="flex items-center gap-2">
    <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
    <Label htmlFor={id}>{children}</Label>
  </div>
);

const StartOver = ({ send }: { readonly send: Send }) => (
  <Button onClick={() => send({ _tag: 'ClickedStartOver' })}>Start over</Button>
);

export const CheckoutView = View.make(Checkout, {
  Cart: ({ model, send }) => (
    <Step
      current={0}
      shipping={model.shipping}
      title="Choose an edition"
      actions={
        <>
          <Continue
            send={send}
            label={
              model.shipping ? 'Continue to shipping' : 'Continue to payment'
            }
          />
          <Cancel send={send} />
        </>
      }
    >
      <RadioGroup
        value={editionName(model.shipping)}
        onValueChange={(value) =>
          send({ _tag: 'SelectedEdition', shipping: value === 'Hardcover' })
        }
      >
        {[true, false].map((shipping) => (
          <div key={editionName(shipping)} className="flex items-center gap-2">
            <RadioGroupItem
              id={`edition-${editionName(shipping)}`}
              value={editionName(shipping)}
            />
            <Label htmlFor={`edition-${editionName(shipping)}`}>
              {editionName(shipping)} · {editionPrice(shipping)}
              <span className="text-muted-foreground">
                {shipping ? ' (ships to you)' : ' (no shipping step)'}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </Step>
  ),
  Shipping: ({ model, send }) => (
    <Step
      current={1}
      shipping={model.shipping}
      title="Shipping"
      actions={
        <>
          <Back send={send} />
          <Continue send={send} />
          <Cancel send={send} />
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Shipping to 1 Infinite Loop, Cupertino. Free standard delivery.
      </p>
    </Step>
  ),
  Payment: ({ model, state, send }) => (
    <Step
      current={2}
      shipping={model.shipping}
      title="Payment"
      actions={
        <>
          <Back send={send} />
          <Continue send={send} />
          <Cancel send={send} />
        </>
      }
    >
      <Toggle
        id="payment"
        checked={state.paymentSelected}
        onChange={(selected) =>
          send({ _tag: 'ToggledPaymentMethod', selected })
        }
      >
        Pay with the Visa ending in 4242
      </Toggle>
    </Step>
  ),
  Review: ({ model, state, children, frame, send }) => (
    <Step
      current={3}
      shipping={model.shipping}
      discount={
        state.promo._tag === 'AppliedPromo' ? state.promo.discount : null
      }
      title="Review your order"
      actions={
        <>
          <Back send={send} />
          <Button
            disabled={!isReviewReady(state)}
            onClick={() => send({ _tag: 'ClickedPlaceOrder' })}
          >
            Place order
          </Button>
          <Cancel send={send} />
        </>
      }
    >
      <Toggle
        id="review-payment"
        checked={state.paymentSelected}
        onChange={(selected) =>
          send({ _tag: 'ToggledPaymentMethod', selected })
        }
      >
        Pay with the Visa ending in 4242
      </Toggle>
      <Toggle
        id="terms"
        checked={state.termsAccepted}
        onChange={(accepted) =>
          send({ _tag: 'ToggledTermsAccepted', accepted })
        }
      >
        I accept the terms of sale
      </Toggle>
      <div className="flex flex-col gap-1">
        <PromoCodeView node={children.promo} frame={frame} />
        {state.promo._tag === 'AppliedPromo' && (
          <p className="text-sm text-emerald-600">
            {state.promo.discount.code}: {state.promo.discount.percentOff}% off
          </p>
        )}
        {state.promo._tag === 'RejectedPromo' && (
          <p className="text-sm text-destructive">
            {state.promo.code} is not a valid code
          </p>
        )}
      </div>
    </Step>
  ),
  Placing: ({ model, state }) => (
    <Step
      current={-1}
      shipping={model.shipping}
      discount={state.discount}
      title="Placing your order…"
    />
  ),
  Confirmed: ({ model, state, send }) => (
    <Step
      current={-1}
      shipping={model.shipping}
      discount={state.discount}
      title="Order confirmed"
      actions={<StartOver send={send} />}
    >
      <p className="text-sm text-muted-foreground">
        Order {state.orderId}.{' '}
        {model.shipping
          ? 'Your hardcover ships tomorrow.'
          : 'Your e-book is ready to download.'}
      </p>
    </Step>
  ),
  Cancelled: ({ model, send }) => (
    <Step
      current={-1}
      shipping={model.shipping}
      title="Checkout cancelled"
      actions={<StartOver send={send} />}
    >
      <p className="text-sm text-muted-foreground">Nothing was charged.</p>
    </Step>
  ),
});
