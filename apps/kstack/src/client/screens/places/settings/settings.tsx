import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kstackz/ui-toolkit/components/ui/alert-dialog';
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
import { ExternalLink, Moon, Sun } from '@kstackz/ui-toolkit/lucide';
import { useState } from 'react';
import {
  AUTH_URL,
  signOutEveryone,
  useApp,
} from '../../../state/machine/index.ts';
import {
  useMoney,
  useOnline,
  useUser,
  useWrites,
} from '../../../state/session/index.ts';
import {
  appTheme,
  useChangeSettings,
  useSettings,
} from '../../../state/settings/index.ts';
import { CURRENCIES } from '../../../../domain/ledger/index.ts';
import { Choice, usePlace } from '../../parts/index.ts';
import { GesturesTab } from './gestures-tab.tsx';
import { KeysTab } from './keys-tab.tsx';
import { Row, Section } from './rows.tsx';

/** A tab of Settings. */
export type SettingsTab = 'general' | 'keys' | 'gestures';

/**
 * Settings, a Place: how Ledger looks and sounds on this device, the User's
 * money, and who is signed in; every key, to change; and every gesture, to
 * learn.
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
          <Users />
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
  const settings = useSettings();
  const change = useChangeSettings();
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
        <Row
          label="Sounds"
          hint="A quiet sound as each command runs from a key or a tap. Gesture sounds are under Gestures."
        >
          <Switch
            checked={settings.sound}
            onCheckedChange={(sound) => change({ sound })}
            aria-label="Sounds"
          />
        </Row>
      </div>
    </Section>
  );
}

function Data() {
  const money = useMoney();
  const { sample, clear, setCurrency } = useWrites();
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
      <div className="divide-y">
        <Row label="Currency">
          <NativeSelect
            value={money.currency}
            onChange={(event) => setCurrency(event.target.value)}
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

function Users() {
  const user = useUser();
  const settings = useSettings();
  const change = useChangeSettings();
  return (
    <Section title="Users">
      <div className="divide-y">
        <Row
          label="Switching user"
          hint="Whether choosing another user in the sidebar changes every tab, or this tab only."
        >
          <Choice
            label="Switching user"
            value={settings.switching}
            onChange={(switching) => change({ switching })}
            className="mx-0 px-0"
            options={[
              { value: 'browser', label: 'Every tab' },
              { value: 'tab', label: 'This tab' },
            ]}
          />
        </Row>
        <Row
          label="Manage Google accounts"
          hint={`Where ${user.email} is signed in, and the apps it lets in, at the sign-in service.`}
        >
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={AUTH_URL} target="_blank" rel="noopener" />}
          >
            <ExternalLink aria-hidden="true" />
            Manage
          </Button>
        </Row>
        <Row
          label="Sign out everyone"
          hint="Every user leaves this browser, and their money leaves this device."
        >
          <SignOutEveryone />
        </Row>
      </div>
    </Section>
  );
}

function SignOutEveryone() {
  const app = useApp();
  const online = useOnline();
  const count = app.kind === 'open' ? app.signedIn.length : 0;
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" disabled={!online || count === 0} />}
      >
        Sign out everyone
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 1 ? 'Sign out?' : `Sign out all ${count} users?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Each one’s money leaves this device and stays in their account.
            Other apps that share this sign-in sign out of this browser too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={signOutEveryone}>
            Sign out everyone
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
