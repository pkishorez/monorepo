import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Settings, type SettingsTab } from '../../app/settings/index.ts';

const TABS: ReadonlyArray<SettingsTab> = ['general', 'keys', 'gestures'];

export const Route = createFileRoute('/_ledger/settings')({
  validateSearch: (search): { tab?: SettingsTab } =>
    TABS.includes(search['tab'] as SettingsTab)
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
