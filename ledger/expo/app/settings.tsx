import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  SECTIONS,
  Settings,
  type SettingsSection,
} from '../src/screens/places/settings';

export default function SettingsRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const section = SECTIONS.find((each) => each === tab) ?? 'general';
  return (
    <Settings
      section={section}
      onSection={(next: SettingsSection) =>
        router.setParams({ tab: next === 'general' ? undefined : next })
      }
    />
  );
}
