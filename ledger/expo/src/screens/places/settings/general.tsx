import { Button } from '@kstackz/expo-toolkit/components/button';
import { Choice } from '@kstackz/expo-toolkit/components/choice';
import { Dialog } from '@kstackz/expo-toolkit/components/dialog';
import { Switch } from '@kstackz/expo-toolkit/components/switch';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { useMoney, useWrites } from '@ledger/core/client/session';
import { CURRENCIES } from '@ledger/core/shared/ledger';
import Constants from 'expo-constants';
import { useState } from 'react';
import { View } from 'react-native';
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

/**
 * Settings' General Section: how Ledger looks, sounds and feels on this
 * phone, the app's version, the User's money, and who is signed in.
 */
export function General() {
  return (
    <View className="gap-10">
      <LookAndFeel />
      <App />
      <Data />
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

// The web's App rows: there is nothing to install on a phone, so only the
// version this app runs.
function App() {
  return (
    <Group title="App">
      <Row label="Version">
        <Text muted className="text-sm">
          {Constants.expoConfig?.version ?? '—'}
        </Text>
      </Row>
    </Group>
  );
}

function Data() {
  const money = useMoney();
  const { sample, clear, setCurrency } = useWrites();
  const online = useOnline();
  const backend = useBackend();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setSure(false);
    }
  };
  return (
    <Group title="Your money">
      <Text muted className="pb-1 text-sm">
        {money.entries.length} entries in {money.accounts.length} accounts,
        {backend === 'local'
          ? ' kept on this phone only.'
          : ' kept on this phone and in your account.'}
      </Text>
      <View className="gap-2 py-3">
        <Text className="text-sm">Currency</Text>
        <Choice
          bleed={16}
          label="Currency"
          value={money.currency}
          onChange={setCurrency}
          options={CURRENCIES.map((currency) => ({
            value: currency,
            label: currency,
          }))}
        />
      </View>
      <View className="flex-row flex-wrap gap-2 pt-3">
        {money.accounts.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={!online || busy}
            onPress={() => void act(() => sample(true))}
          >
            Load sample money
          </Button>
        )}
        {money.accounts.length > 0 && (
          <Button
            variant={sure ? 'destructive' : 'outline'}
            size="sm"
            disabled={!online || busy}
            onPress={() => (sure ? void act(clear) : setSure(true))}
          >
            {sure ? 'Delete everything, for good' : 'Delete everything'}
          </Button>
        )}
      </View>
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
