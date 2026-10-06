import { useSidebar } from '@kstackz/expo-toolkit/patterns/sidebar';
import { keys, useCommand } from '@ledger/core/client/commands';
import { useRouter } from 'expo-router';
import { useAppTheme, useOnline } from '../../ledger';

/**
 * The Global Commands every Place shares and none answers on its own: Go,
 * the theme, the Sidebar, and opening Add. Each Go is a router move, the
 * new Place shown at once. Jump, Next and Previous are each Place's own.
 */
export function Globals() {
  const router = useRouter();
  const { toggleTheme } = useAppTheme();
  const { toggle } = useSidebar();
  const { openSurface } = keys.useSurface();
  const online = useOnline();
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
  // A new Entry needs the server, so Add waits for the network.
  useCommand('addEntry', () => openSurface('add'), { enabled: online });
  return null;
}
