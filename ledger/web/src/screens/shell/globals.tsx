import { useAppShell } from '@kstackz/web-toolkit/recipes/frame';
import { useNavigate } from '@tanstack/react-router';
import { keys, useCommand } from '@ledger/core/app/commands';
import { appTheme, useGate } from '../../app.ts';

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
  const { online } = useGate();

  useCommand('toHome', () => void navigate({ to: '/' }));
  useCommand('toEntries', () => void navigate({ to: '/entries' }));
  useCommand('toMonths', () => void navigate({ to: '/months' }));
  useCommand('toSettings', () => void navigate({ to: '/settings' }));
  useCommand('toGeneralSettings', () => void navigate({ to: '/settings' }));
  useCommand(
    'toKeysSettings',
    () => void navigate({ to: '/settings', search: { tab: 'keys' } }),
  );
  useCommand(
    'toGesturesSettings',
    () => void navigate({ to: '/settings', search: { tab: 'gestures' } }),
  );
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
