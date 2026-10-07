import { Tabs } from '@kstackz/expo-toolkit/components/tabs';
import { Pages } from '@kstackz/expo-toolkit/recipes/pages';
import { usePlace } from '@ledger/core/app/commands';
import { type SectionId, SETTINGS_SECTIONS } from '@ledger/core/app/places';
import { View } from 'react-native';
import { useFeel } from '../../../ledger';
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

// The Sidebar's edge strip, in points: a swipe from there opens the Sidebar
// on any Section.
const EDGE = 24;

/**
 * Settings, a Place: how Ledger looks and feels on this phone, its
 * version, the User's money and who is signed in, in General; the Thumb
 * Lock and the guide to every gesture in Gestures. The tabs stay at the
 * top while a Section scrolls; a swipe sideways turns the Section, as on
 * the web, and on General a swipe right opens the Sidebar, which Pages
 * leave to the zone around them.
 */
export function Settings(props: {
  readonly section: SettingsSection;
  readonly onSection: (section: SettingsSection) => void;
}) {
  usePlace('settings');
  const { onSection } = props;
  const feel = useFeel();
  return (
    <View className="flex-1">
      <View className="bg-background px-4 pt-3">
        <Tabs
          variant="underline"
          defaultValue="general"
          value={props.section}
          onValueChange={(next) => onSection(next as SettingsSection)}
        >
          <Tabs.List>
            {SECTIONS.map((section) => (
              <Tabs.Trigger key={section} value={section}>
                {LABELS[section]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      </View>
      <Pages
        page={SECTIONS.indexOf(props.section)}
        onPage={(page) => {
          const section = SECTIONS[page];
          if (section === undefined) return;
          feel('page');
          onSection(section);
        }}
        edge={EDGE}
      >
        <Scroll>
          <General />
        </Scroll>
        <Scroll>
          <Gestures />
        </Scroll>
      </Pages>
    </View>
  );
}
