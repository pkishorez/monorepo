import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  SETTINGS_TABS,
  Settings,
  type SettingsTab,
} from '../../screens/places/settings/index.ts';

export const Route = createFileRoute('/_ledger/settings')({
  validateSearch: (search): { tab?: SettingsTab } =>
    SETTINGS_TABS.includes(search['tab'] as SettingsTab)
      ? { tab: search['tab'] as SettingsTab }
      : {},
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <Settings
      tab={tab ?? 'general'}
      onTab={(next) =>
        void navigate({
          to: '/settings',
          search: next === 'general' ? {} : { tab: next },
          replace: true,
        })
      }
    />
  );
}
