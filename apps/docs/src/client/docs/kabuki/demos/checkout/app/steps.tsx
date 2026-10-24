import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { Label } from '@kestack/web-platform/ui/components/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@kestack/web-platform/ui/components/radio-group';
import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';
import { PRICE, priceOf, type Format } from './checkout.ts';

/*
 * One form per step, in plain React. What you type stays in React state; a
 * step only reports back, once, when you press Continue.
 */

const money = (dollars: number) => `$${dollars.toFixed(2)}`;

const FORMAT_INFO = {
  Paperback: { name: 'Paperback', note: 'Shipped to your door' },
  Ebook: { name: 'E-book', note: 'Sent to your inbox' },
};

export function CartStep({
  format,
  onNext,
}: {
  readonly format: Format;
  readonly onNext: (format: Format) => void;
}) {
  const [picked, setPicked] = useState(format);
  return (
    <Step title="The Kabuki Handbook" onSubmit={() => onNext(picked)}>
      <RadioGroup
        aria-label="Format"
        value={picked}
        onValueChange={(value) => setPicked(value as Format)}
        className="gap-2"
      >
        {(['Paperback', 'Ebook'] as const).map((option) => (
          <Label
            key={option}
            className="h-14 cursor-pointer gap-3 rounded-lg border border-border px-3 font-normal has-data-checked:border-primary has-data-checked:bg-muted/50"
          >
            <RadioGroupItem value={option} />
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-medium">{FORMAT_INFO[option].name}</span>
              <span className="text-xs text-muted-foreground">
                {FORMAT_INFO[option].note}
              </span>
            </span>
            <span className="tabular-nums">{money(PRICE[option])}</span>
          </Label>
        ))}
      </RadioGroup>
    </Step>
  );
}

export function ShippingStep({
  address,
  onBack,
  onNext,
}: {
  readonly address: string;
  readonly onBack: () => void;
  readonly onNext: (address: string) => void;
}) {
  const [value, setValue] = useState(address);
  return (
    <Step
      title="Where should it go?"
      onBack={onBack}
      ready={value.trim() !== ''}
      onSubmit={() => onNext(value.trim())}
    >
      <Field id="checkout-address" label="Address">
        <Input
          id="checkout-address"
          autoComplete="street-address"
          placeholder="Street and city"
          className="h-10"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Step>
  );
}

export function PaymentStep({
  onBack,
  onNext,
}: {
  readonly onBack: () => void;
  readonly onNext: (lastFour: string) => void;
}) {
  const [value, setValue] = useState('');
  const digits = value.replace(/\D/g, '');
  return (
    <Step
      title="How will you pay?"
      onBack={onBack}
      ready={digits.length === 16}
      onSubmit={() => onNext(digits.slice(-4))}
    >
      <Field
        id="checkout-card"
        label="Card number"
        hint="Any 16 digits will do, like 4242 4242 4242 4242."
      >
        <Input
          id="checkout-card"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="16 digits"
          maxLength={19}
          className="h-10 tabular-nums"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Step>
  );
}

export function ReviewStep({
  order,
  rejected,
  onBack,
  onPromo,
  onNext,
}: {
  readonly order: Parameters<typeof priceOf>[0];
  readonly rejected: string | null;
  readonly onBack: () => void;
  readonly onPromo: (code: string) => void;
  readonly onNext: () => void;
}) {
  const [code, setCode] = useState('');
  const price = priceOf(order);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
        <dt>{FORMAT_INFO[order.format].name}</dt>
        <dd className="pl-4 text-right">{money(price.item)}</dd>
        <dt className="text-muted-foreground">Shipping</dt>
        <dd className="pl-4 text-right text-muted-foreground">
          {price.shipping ? money(price.shipping) : 'None'}
        </dd>
        {order.promo && (
          <>
            <dt className="text-muted-foreground">{order.promo}</dt>
            <dd className="pl-4 text-right text-emerald-700 dark:text-emerald-400">
              −{money(price.discount)}
            </dd>
          </>
        )}
        <dt className="mt-1 border-t border-border pt-1.5 font-medium">
          Total
        </dt>
        <dd className="mt-1 border-t border-border pt-1.5 pl-4 text-right font-medium">
          {money(price.total)}
        </dd>
      </dl>
      {!order.promo && (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onPromo(code);
          }}
        >
          <div className="flex gap-2">
            <Input
              aria-label="Promo code"
              aria-invalid={rejected !== null}
              aria-describedby={rejected ? 'checkout-promo-error' : undefined}
              placeholder="Promo code"
              className="h-10"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={code.trim() === ''}
            >
              Apply
            </Button>
          </div>
          {rejected && (
            <p
              id="checkout-promo-error"
              className="flex items-center gap-1.5 text-xs text-destructive"
            >
              <CircleAlertIcon className="size-3.5" />
              {`“${rejected}” isn't a code we know. Try SAVE10.`}
            </p>
          )}
        </form>
      )}
      <Actions onBack={onBack}>
        <Button size="lg" onClick={onNext}>
          Place order · {money(price.total)}
        </Button>
      </Actions>
    </div>
  );
}

// A step's title, its fields, and Back and Continue under them.
function Step({
  title,
  ready = true,
  onBack,
  onSubmit,
  children,
}: {
  readonly title: string;
  readonly ready?: boolean;
  readonly onBack?: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onSubmit();
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
      <Actions onBack={onBack}>
        <Button type="submit" size="lg" disabled={!ready}>
          Continue
        </Button>
      </Actions>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Actions({
  onBack,
  children,
}: {
  readonly onBack?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {onBack ? (
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}
