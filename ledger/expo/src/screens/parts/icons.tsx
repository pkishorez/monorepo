import BankIcon from '@hugeicons/core-free-icons/BankIcon';
import Calendar01Icon from '@hugeicons/core-free-icons/Calendar01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Cash01Icon from '@hugeicons/core-free-icons/Cash01Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import File01Icon from '@hugeicons/core-free-icons/File01Icon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import KeyboardIcon from '@hugeicons/core-free-icons/KeyboardIcon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import PiggyBankIcon from '@hugeicons/core-free-icons/PiggyBankIcon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import SlidersHorizontalIcon from '@hugeicons/core-free-icons/SlidersHorizontalIcon';
import TouchInteraction01Icon from '@hugeicons/core-free-icons/TouchInteraction01Icon';
import Wallet01Icon from '@hugeicons/core-free-icons/Wallet01Icon';
import { Glyph, type GlyphProps } from '@kstackz/expo-toolkit/components/glyph';
import type { StopIcon as Name } from '@ledger/core/client/places';

const GLYPHS: Readonly<Record<Name, GlyphProps['icon']>> = {
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
  cash: Cash01Icon,
  bank: BankIcon,
  card: CreditCardIcon,
  savings: PiggyBankIcon,
};

/** The icon of a Place, a Section, an Account's kind or another stop. */
export function StopIcon(
  props: { readonly name: Name } & Omit<GlyphProps, 'icon'>,
) {
  const { name, ...rest } = props;
  return <Glyph icon={GLYPHS[name]} {...rest} />;
}
