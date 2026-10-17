import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { CircleCheckIcon } from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { CheckoutLive } from './checkout.ts';
import { CartStep, PaymentStep, ReviewStep, ShippingStep } from './steps.tsx';

const STEPS = ['Cart', 'Shipping', 'Payment', 'Review'] as const;

// Draws the step the checkout is on. The forms are plain React; each one
// sends a single Message when it is done.
export const CheckoutView = View.make(
  CheckoutLive,
  ({ _tag, state, model, send, root }) => {
    const back = () => send({ _tag: 'WentBack' });
    switch (_tag) {
      case 'Placing':
        return (
          <div {...root} className="flex flex-col items-center gap-3">
            <Spinner className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Placing your order…</p>
          </div>
        );
      case 'Placed':
        return (
          <div
            {...root}
            className="flex max-w-xs flex-col items-center gap-2 text-center"
          >
            <CircleCheckIcon className="size-9 text-emerald-600" />
            <h3 className="mt-1 text-lg font-medium">Order placed</h3>
            <p className="text-sm text-balance text-muted-foreground">
              Order {state.order}.{' '}
              {model.format === 'Ebook'
                ? 'Your e-book is on its way to your inbox.'
                : `Your paperback ships to ${model.address}.`}
            </p>
            <Button
              variant="outline"
              size="lg"
              className="mt-3"
              onClick={() => send({ _tag: 'StartedOver' })}
            >
              Start over
            </Button>
          </div>
        );
      default:
        return (
          <div {...root} className="flex w-full max-w-sm flex-col gap-5">
            <StepBar
              current={_tag}
              skipped={_tag !== 'Cart' && model.format === 'Ebook'}
            />
            {_tag === 'Cart' && (
              <CartStep
                format={model.format}
                onNext={(format) => send({ _tag: 'FormatChosen', format })}
              />
            )}
            {_tag === 'Shipping' && (
              <ShippingStep
                address={model.address}
                onBack={back}
                onNext={(address) => send({ _tag: 'AddressGiven', address })}
              />
            )}
            {_tag === 'Payment' && (
              <PaymentStep
                onBack={back}
                onNext={(card) => send({ _tag: 'CardGiven', card })}
              />
            )}
            {_tag === 'Review' && (
              <ReviewStep
                order={model}
                rejected={state.rejected}
                onBack={back}
                onPromo={(code) => send({ _tag: 'PromoTried', code })}
                onNext={() => send({ _tag: 'OrderPlaced' })}
              />
            )}
          </div>
        );
    }
  },
);

// The four steps, as a bar: done, current, still to come, or skipped.
function StepBar({
  current,
  skipped,
}: {
  readonly current: (typeof STEPS)[number];
  readonly skipped: boolean;
}) {
  const at = STEPS.indexOf(current);
  return (
    <ol className="grid grid-cols-4 gap-1.5 text-xs">
      {STEPS.map((step, index) => {
        const skip = skipped && step === 'Shipping';
        return (
          <li
            key={step}
            aria-current={index === at ? 'step' : undefined}
            className="flex flex-col gap-1.5"
          >
            <span
              className={`h-1 rounded-full ${
                skip
                  ? 'border-t border-dashed border-border'
                  : index <= at
                    ? 'bg-primary'
                    : 'bg-muted'
              }`}
            />
            <span
              className={`${index === at ? 'font-medium text-foreground' : 'text-muted-foreground'} ${skip ? 'line-through' : ''}`}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
