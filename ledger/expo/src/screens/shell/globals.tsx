import { useSidebar } from '@kstackz/expo-toolkit/patterns/sidebar';
import { useCommand } from '@ledger/core/client/commands';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../../ledger';

/**
 * The Global Commands every Place shares and none answers on its own: Go,
 * the theme and the Sidebar. Each Go is a router move, the new Place shown
 * at once. Jump, Next and Previous are each Place's own (Phase 3b), and so
 * is Add, with its sheet.
 */
export function Globals() {
  const router = useRouter();
  const { toggleTheme } = useAppTheme();
  const { toggle } = useSidebar();
  const settings = (section?: 'gestures') =>
    router.navigate({
      pathname: '/settings',
      params: section === undefined ? {} : { tab: section },
    });

  useCommand('toHome', () => router.navigate('/'));
  useCommand('toEntries', () => router.navigate('/entries'));
  useCommand('toMonths', () => router.navigate('/months'));
  useCommand('toSettings', () => settings());
  useCommand('toGeneralSettings', () => settings());
  useCommand('toGesturesSettings', () => settings('gestures'));
  useCommand('theme', toggleTheme);
  useCommand('toggleSidebar', toggle);
  return null;
}
