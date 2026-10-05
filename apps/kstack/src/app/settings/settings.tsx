import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kstackz/ui-toolkit/components/ui/native-select';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kstackz/ui-toolkit/components/ui/tabs';
import { Moon, Sun } from '@kstackz/ui-toolkit/lucide';
import { deleteStdSync } from '@kstackz/std-toolkit/sync/platform/browser';
import { useState } from 'react';
import { appTheme } from '../../common/theme.ts';
import {
  ledgerName,
  useMoney,
  useOnline,
  useWrites,
} from '../../client/data/index.ts';
import { authClient, useUser } from '../../client/session/index.ts';
import { CURRENCIES } from '../../domain/ledger/index.ts';
import { Choice, usePlace } from '../parts/index.ts';
import { GesturesTab } from './gestures-tab.tsx';
import { KeysTab } from './keys-tab.tsx';
import { Row, Section } from './rows.tsx';

/** A tab of Settings. */
export type SettingsTab = 'general' | 'keys' | 'gestures';

/**
 * Settings, a Place: how Ledger looks and sounds, the user's money and
 * account; every key, to change; and every gesture, to learn.
 */
export function Settings(props: {
  readonly tab: SettingsTab;
  readonly onTab: (tab: SettingsTab) => void;
}) {
  usePlace('settings');
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28 @md:px-8 @md:py-10">
      <Tabs
        value={props.tab}
        onValueChange={(tab) => props.onTab(tab as SettingsTab)}
        className="gap-8"
      >
        <TabsList variant="line" className="-ml-2">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="gestures">Gestures</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="space-y-10">
          <Appearance />
          <Data />
          <Account />
        </TabsContent>
        <TabsContent value="keys">
          <KeysTab />
        </TabsContent>
        <TabsContent value="gestures">
          <GesturesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = appTheme.useTheme();
  const { preferences } = useMoney();
  const { setPreferences } = useWrites();
  return (
    <Section title="Look and sound">
      <div className="divide-y">
        <Row label="Theme">
          <Choice
            label="Theme"
            value={theme}
            onChange={setTheme}
            className="mx-0 px-0"
            options={[
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
            ]}
          />
        </Row>
        <Row label="Sounds" hint="A quiet sound as each command runs.">
          <Switch
            checked={preferences.sound}
            onCheckedChange={(sound) => setPreferences({ sound })}
            aria-label="Sounds"
          />
        </Row>
        <Row label="Currency">
          <NativeSelect
            value={preferences.currency}
            onChange={(event) =>
              setPreferences({ currency: event.target.value })
            }
            aria-label="Currency"
          >
            {CURRENCIES.map((currency) => (
              <NativeSelectOption key={currency} value={currency}>
                {currency}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Row>
      </div>
    </Section>
  );
}

function Data() {
  const money = useMoney();
  const { sample, clear } = useWrites();
  const online = useOnline();
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
    <Section title="Your money">
      <p className="text-sm text-muted-foreground">
        {money.entries.length} entries in {money.accounts.length} accounts, kept
        on this device and in your account.
      </p>
      <div className="flex flex-wrap gap-2">
        {money.accounts.length === 0 && (
          <Button
            variant="outline"
            disabled={!online || busy}
            onClick={() => void act(() => sample(true))}
          >
            Load sample money
          </Button>
        )}
        {money.accounts.length > 0 && (
          <Button
            variant={sure ? 'destructive' : 'outline'}
            disabled={!online || busy}
            onClick={() => (sure ? void act(clear) : setSure(true))}
          >
            {sure ? 'Delete everything, for good' : 'Delete everything'}
          </Button>
        )}
      </div>
    </Section>
  );
}

function Account() {
  const user = useUser();
  return (
    <Section title="Account">
      <Row label={user.name} hint={user.email}>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut();
            // This browser forgets the money of whoever signed out.
            await deleteStdSync(ledgerName(user.id)).catch(() => {});
          }}
        >
          Sign out
        </Button>
      </Row>
    </Section>
  );
}
