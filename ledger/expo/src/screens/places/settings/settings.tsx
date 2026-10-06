import { Button } from '@kstackz/expo-toolkit/components/button';
import { Dialog } from '@kstackz/expo-toolkit/components/dialog';
import { Switch } from '@kstackz/expo-toolkit/components/switch';
import { Tabs } from '@kstackz/expo-toolkit/components/tabs';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { type SectionId, SETTINGS_SECTIONS } from '@ledger/core/client/places';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  setBackend,
  signOutEveryone,
  useApp,
  useAppTheme,
  useBackend,
  useChangeSettings,
  useOnline,
  useSettings,
} from '../../../ledger';
import { Flip, Group, Row } from './rows';

/** A Section of Settings on a phone: Keys are left out, as there is no
 * keyboard. */
export type SettingsSection = Exclude<SectionId, 'keys'>;

/** The Sections of Settings on a phone, in order. */
export const SECTIONS: ReadonlyArray<SettingsSection> = ['general', 'gestures'];

const LABELS = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section.label]),
) as Readonly<Record<SectionId, string>>;

/**
 * Settings, a Place: how Ledger looks, sounds and feels on this phone, and
 * who is signed in, in General; the Thumb Lock in Gestures. Phase 3b adds
 * the money and app rows and the guide to every gesture.
 */
export function Settings(props: {
  readonly section: SettingsSection;
  readonly onSection: (section: SettingsSection) => void;
}) {
  return (
    <ScrollView contentContainerClassName="gap-6 p-4 pb-28">
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
      {props.section === 'general' ? <General /> : <Gestures />}
    </ScrollView>
  );
}

function General() {
  return (
    <View className="gap-8">
      <LookAndFeel />
      <Users />
    </View>
  );
}

function LookAndFeel() {
  const { theme, setTheme } = useAppTheme();
  const settings = useSettings();
  const change = useChangeSettings();
  return (
    <Group title="Look and feel">
      <Row label="Theme">
        <Flip
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Row>
      <Row
        label="Sounds"
        hint="Quiet sounds as commands run, from a tap or a gesture."
      >
        <Switch
          value={settings.sound}
          onValueChange={(sound) => change({ sound })}
          label="Sounds"
        />
      </Row>
      <Row
        label="Haptics"
        hint="A light buzz as the Thumb Lock locks, steps and goes."
      >
        <Switch
          value={settings.haptics}
          onValueChange={(haptics) => change({ haptics })}
          label="Haptics"
        />
      </Row>
    </Group>
  );
}

function Users() {
  const backend = useBackend();
  return (
    <Group title="Users">
      <Row
        label="Backend"
        hint="Remote keeps your money for every device, with Google to sign in. Local keeps it on this phone, with anyone to sign in as. Each keeps its own users."
      >
        <Flip
          value={backend ?? 'remote'}
          onChange={(next) => void setBackend(next)}
          options={[
            { value: 'remote', label: 'Remote' },
            { value: 'local', label: 'Local' },
          ]}
        />
      </Row>
      <Row
        label="Sign out everyone"
        hint="Every user leaves this phone, and their money leaves it too."
      >
        <SignOutEveryone />
      </Row>
    </Group>
  );
}

function SignOutEveryone() {
  const app = useApp();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const count = app.kind === 'open' ? app.signedIn.length : 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button variant="outline" size="sm" disabled={!online || count === 0}>
          Sign out
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>
          {count === 1 ? 'Sign out?' : `Sign out all ${count} users?`}
        </Dialog.Title>
        <Dialog.Description>
          Each one’s money leaves this phone and stays in their account.
        </Dialog.Description>
        <Dialog.Footer>
          <Button variant="outline" onPress={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onPress={() => {
              setOpen(false);
              signOutEveryone();
            }}
          >
            Sign out everyone
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function Gestures() {
  const settings = useSettings();
  const change = useChangeSettings();
  return (
    <View className="gap-8">
      <Group title="Thumb Lock">
        <Row
          label="Thumb Lock"
          hint="Rest your left thumb and swipe with another finger to step through the places."
        >
          <Switch
            value={settings.gesturesOn}
            onValueChange={(gesturesOn) => change({ gesturesOn })}
            label="Thumb Lock"
          />
        </Row>
      </Group>
      <Text muted className="text-sm">
        The guide to every gesture arrives with the Places.
      </Text>
    </View>
  );
}
