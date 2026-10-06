import BankIcon from '@hugeicons/core-free-icons/BankIcon';
import Briefcase01Icon from '@hugeicons/core-free-icons/Briefcase01Icon';
import Calendar01Icon from '@hugeicons/core-free-icons/Calendar01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Car01Icon from '@hugeicons/core-free-icons/Car01Icon';
import Cash01Icon from '@hugeicons/core-free-icons/Cash01Icon';
import CircleIcon from '@hugeicons/core-free-icons/CircleIcon';
import Coffee02Icon from '@hugeicons/core-free-icons/Coffee02Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import File01Icon from '@hugeicons/core-free-icons/File01Icon';
import Film01Icon from '@hugeicons/core-free-icons/Film01Icon';
import GiftIcon from '@hugeicons/core-free-icons/GiftIcon';
import HealthIcon from '@hugeicons/core-free-icons/HealthIcon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Home03Icon from '@hugeicons/core-free-icons/Home03Icon';
import KeyboardIcon from '@hugeicons/core-free-icons/KeyboardIcon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import PiggyBankIcon from '@hugeicons/core-free-icons/PiggyBankIcon';
import Restaurant01Icon from '@hugeicons/core-free-icons/Restaurant01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import ShoppingBag01Icon from '@hugeicons/core-free-icons/ShoppingBag01Icon';
import SlidersHorizontalIcon from '@hugeicons/core-free-icons/SlidersHorizontalIcon';
import TouchInteraction01Icon from '@hugeicons/core-free-icons/TouchInteraction01Icon';
import Wallet01Icon from '@hugeicons/core-free-icons/Wallet01Icon';
import { Glyph, type GlyphProps } from '@kstackz/expo-toolkit/components/glyph';
import type { StopIcon as Name } from '@ledger/core/client/places';
import type { Account } from '@ledger/core/shared/ledger';

type Icon = GlyphProps['icon'];
type Look = Omit<GlyphProps, 'icon'>;

const ACCOUNT_GLYPHS: Readonly<Record<Account['kind'], Icon>> = {
  cash: Cash01Icon,
  bank: BankIcon,
  card: CreditCardIcon,
  savings: PiggyBankIcon,
};

const GLYPHS: Readonly<Record<Name, Icon>> = {
  ...ACCOUNT_GLYPHS,
  home: Home01Icon,
  entries: LeftToRightListBulletIcon,
  months: Calendar03Icon,
  settings: Settings01Icon,
  general: SlidersHorizontalIcon,
  keys: KeyboardIcon,
  gestures: TouchInteraction01Icon,
  entry: File01Icon,
  month: Calendar01Icon,
  accounts: Wallet01Icon,
};

// The web's Lucide names for a Category's icon, drawn with Hugeicons.
const CATEGORY_GLYPHS: Readonly<Record<string, Icon>> = {
  utensils: Restaurant01Icon,
  coffee: Coffee02Icon,
  house: Home03Icon,
  car: Car01Icon,
  'shopping-bag': ShoppingBag01Icon,
  film: Film01Icon,
  'heart-pulse': HealthIcon,
  briefcase: Briefcase01Icon,
  gift: GiftIcon,
  'piggy-bank': PiggyBankIcon,
};

/** The icon of a Place, a Section, an Account's kind or another stop. */
export function StopIcon(props: { readonly name: Name } & Look) {
  const { name, ...rest } = props;
  return <Glyph icon={GLYPHS[name]} {...rest} />;
}

/** A Category's icon, in the quiet colour of text that supports. */
export function CategoryIcon(
  props: { readonly icon: string | undefined } & Look,
) {
  const { icon, ...rest } = props;
  return (
    <Glyph
      icon={(icon && CATEGORY_GLYPHS[icon]) || CircleIcon}
      size={18}
      {...rest}
    />
  );
}

/** An Account's icon, by its kind. */
export function AccountIcon(
  props: { readonly kind: Account['kind'] | undefined } & Look,
) {
  const { kind, ...rest } = props;
  return (
    <Glyph icon={(kind && ACCOUNT_GLYPHS[kind]) || CircleIcon} {...rest} />
  );
}
