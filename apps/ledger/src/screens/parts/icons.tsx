import {
  Banknote,
  Briefcase,
  CalendarDays,
  CalendarRange,
  Car,
  Circle,
  Coffee,
  CreditCard,
  FileText,
  Film,
  Gift,
  Hand,
  HeartPulse,
  House,
  Keyboard,
  Landmark,
  List,
  type LucideIcon,
  PiggyBank,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Utensils,
  Wallet,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { StopIcon } from '../../places/index.ts';
import type { Account } from '../../model/index.ts';

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

const accountIcon = (kind: Account['kind'] | undefined): LucideIcon =>
  (kind && ACCOUNT_ICONS[kind]) || Circle;

const STOP_ICONS: Readonly<Record<StopIcon, LucideIcon>> = {
  ...ACCOUNT_ICONS,
  home: House,
  entries: List,
  months: CalendarRange,
  settings: Settings,
  general: SlidersHorizontal,
  keys: Keyboard,
  gestures: Hand,
  entry: FileText,
  month: CalendarDays,
  accounts: Wallet,
};

/** The icon of a Place, a Section or another stop of the Thumb Picker. */
export const stopIcon = (icon: StopIcon): LucideIcon => STOP_ICONS[icon];

/** An Account's icon, by its kind. */
export function AccountIcon(props: {
  readonly kind: Account['kind'] | undefined;
  readonly className?: string;
}) {
  const Icon = accountIcon(props.kind);
  return <Icon className={props.className} aria-hidden="true" />;
}
