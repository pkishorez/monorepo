import {
  Banknote,
  Briefcase,
  Car,
  Circle,
  Coffee,
  CreditCard,
  Film,
  Gift,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  PiggyBank,
  ShoppingBag,
  Utensils,
} from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import type { Account } from '../../../domain/ledger/index.ts';

const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  utensils: Utensils,
  coffee: Coffee,
  house: House,
  car: Car,
  'shopping-bag': ShoppingBag,
  film: Film,
  'heart-pulse': HeartPulse,
  briefcase: Briefcase,
  gift: Gift,
  'piggy-bank': PiggyBank,
};

/** A Category's icon, in the quiet colour of text that supports. */
export function CategoryIcon(props: {
  readonly icon: string | undefined;
  readonly className?: string;
}) {
  const Icon = (props.icon && CATEGORY_ICONS[props.icon]) || Circle;
  return (
    <Icon
      className={cn('size-4 shrink-0 text-muted-foreground', props.className)}
      aria-hidden="true"
    />
  );
}

const ACCOUNT_ICONS: Readonly<Record<Account['kind'], LucideIcon>> = {
  cash: Banknote,
  bank: Landmark,
  card: CreditCard,
  savings: PiggyBank,
};

/** An Account's icon, by its kind. */
export function AccountIcon(props: {
  readonly kind: Account['kind'] | undefined;
  readonly className?: string;
}) {
  const Icon = (props.kind && ACCOUNT_ICONS[props.kind]) || Circle;
  return <Icon className={props.className} aria-hidden="true" />;
}
