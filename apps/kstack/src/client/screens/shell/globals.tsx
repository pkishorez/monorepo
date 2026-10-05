import { useAppShell } from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { useNavigate } from '@tanstack/react-router';
import { keys, useCommand } from '../../commands/index.ts';
import { appTheme } from '../../state/settings/index.ts';
import { useOnline } from '../../state/session/index.ts';

/**
 * The Global Commands every Place shares and none answers on its own: Go,
 * the theme, the sidebar, and opening Add. Jump, Next and Previous are
 * each Place's own; giving the Sidebar the keys is the Sidebar's.
 */
export function Globals() {
  const navigate = useNavigate();
  const { toggleTheme } = appTheme.useTheme();
  const { toggle } = useAppShell();
  const { openSurface } = keys.useSurface();
  const online = useOnline();

  useCommand('toHome', () => void navigate({ to: '/' }));
  useCommand('toEntries', () => void navigate({ to: '/entries' }));
  useCommand('toMonths', () => void navigate({ to: '/months' }));
  useCommand('toSettings', () => void navigate({ to: '/settings' }));
  useCommand(
    'help',
    () => void navigate({ to: '/settings', search: { tab: 'keys' } }),
  );
  useCommand('theme', toggleTheme);
  useCommand('toggleSidebar', toggle);
  // A new Entry needs the server, so Add waits for the network.
  useCommand('addEntry', () => openSurface('add'), { enabled: online });
  return null;
}
