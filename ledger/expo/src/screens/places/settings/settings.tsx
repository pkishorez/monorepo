import { Tabs } from '@kstackz/expo-toolkit/components/tabs';
import { usePlace } from '@ledger/core/client/commands';
import { type SectionId, SETTINGS_SECTIONS } from '@ledger/core/client/places';
import { View } from 'react-native';
import { Scroll } from '../../parts';
import { General } from './general';
import { Gestures } from './gestures';

/** A Section of Settings on a phone: Keys are left out, as there is no
 * keyboard. */
export type SettingsSection = Exclude<SectionId, 'keys'>;

/** The Sections of Settings on a phone, in order. */
export const SECTIONS: ReadonlyArray<SettingsSection> = ['general', 'gestures'];

const LABELS = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section.label]),
) as Readonly<Record<SectionId, string>>;

/**
 * Settings, a Place: how Ledger looks, sounds and feels on this phone, its
 * version, the User's money and who is signed in, in General; the Thumb
 * Lock and the guide to every gesture in Gestures.
 */
export function Settings(props: {
  readonly section: SettingsSection;
  readonly onSection: (section: SettingsSection) => void;
}) {
  usePlace('settings');
  return (
    <Scroll className="gap-6 pt-3">
      <Tabs
        variant="underline"
        defaultValue="general"
        value={props.section}
        onValueChange={(next) => props.onSection(next as SettingsSection)}
      >
        <Tabs.List>
          {SECTIONS.map((section) => (
            <Tabs.Trigger key={section} value={section}>
              {LABELS[section]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
      <View>{props.section === 'general' ? <General /> : <Gestures />}</View>
    </Scroll>
  );
}
