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
  TabsList,
  TabsTrigger,
} from '@kstackz/ui-toolkit/components/ui/tabs';
import { ExternalLink, Moon, Sun } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone } from '@kstackz/use-gesture';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
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
import { usePlace } from '../../parts/index.ts';
import { AppSection } from './app-section.tsx';
import { GesturesTab } from './gestures-tab.tsx';
import { KeysTab } from './keys-tab.tsx';
import { Flip, Row, Section } from './rows.tsx';

/** A tab of Settings. */
export type SettingsTab = 'general' | 'keys' | 'gestures';

/** The tabs of Settings, in order. */
export const SETTINGS_TABS: ReadonlyArray<SettingsTab> = [
  'general',
  'keys',
  'gestures',
];

/** What each tab is called. */
const LABELS: Readonly<Record<SettingsTab, string>> = {
  general: 'General',
  keys: 'Keys',
  gestures: 'Gestures',
};

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;

/**
 * Settings, a Place: how Ledger looks and sounds on this device, installing
 * it and its version, the User's money, and who is signed in; every key, to change; and every gesture, to
 * learn.
 */
export function Settings(props: {
  readonly tab: SettingsTab;
  readonly onTab: (tab: SettingsTab) => void;
}) {
  usePlace('settings');
  // A Gesture Zone of its own, so its swipes turn the tabs before the
  // sidebar hears them.
  return (
    <GestureZone>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-28 @md:px-8 @md:py-10">
        <Tabs
          value={props.tab}
          onValueChange={(tab) => props.onTab(tab as SettingsTab)}
          className="gap-8"
        >
          <TabsList variant="line" className="-ml-2">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
          <Pages tab={props.tab} onTab={props.onTab} />
        </Tabs>
      </div>
    </GestureZone>
  );
}

function pageOf(tab: SettingsTab) {
  if (tab === 'keys') return <KeysTab />;
  if (tab === 'gestures') return <GesturesTab />;
  return (
    <div className="space-y-10">
      <Appearance />
      <AppSection />
      <Data />
      <Users />
    </div>
  );
}

/**
 * Every tab side by side, the chosen one in view, the others inert. A swipe
 * left or right drags them under the finger and, let go far or fast
 * enough, settles on the next tab or the one before; otherwise they spring
 * back. On the first tab a swipe right is not theirs, so it opens the
 * sidebar. A tap on a tab slides them there too.
 */
function Pages(props: {
  readonly tab: SettingsTab;
  readonly onTab: (tab: SettingsTab) => void;
}) {
  const at = SETTINGS_TABS.indexOf(props.tab);
  const track = useRef<HTMLDivElement>(null);
  // Which tab is in view, in tabs: 1.5 is halfway from the second to the third.
  const page = useMotionValue(at);
  const x = useTransform(page, (p) => `${-p * 100}%`);
  const still = useReducedMotion() === true;
  const dragging = useRef(false);

  const settle = (to: number) => {
    dragging.current = false;
    if (still) page.jump(to);
    else void animate(page, to, SPRING);
  };
  const go = (to: number) => {
    const tab = SETTINGS_TABS[to];
    if (tab === undefined) return settle(at);
    settle(to);
    props.onTab(tab);
  };
  const grab = () => {
    dragging.current = true;
    page.stop();
  };

  const left = useSwipe({
    direction: 'left',
    enabled: at < SETTINGS_TABS.length - 1,
    onStart: grab,
    onCommit: () => go(at + 1),
    onCancel: () => settle(at),
  });
  const right = useSwipe({
    direction: 'right',
    enabled: at > 0,
    onStart: grab,
    onCommit: () => go(at - 1),
    onCancel: () => settle(at),
  });
  const follow = () => {
    if (!dragging.current) return;
    const width = track.current?.offsetWidth || 1;
    page.set(at + (left.offset.get() - right.offset.get()) / width);
  };
  useMotionValueEvent(left.offset, 'change', follow);
  useMotionValueEvent(right.offset, 'change', follow);

  // A tab chosen another way, by a tap or the address, slides into view.
  useEffect(() => {
    if (dragging.current) return;
    if (still) page.jump(at);
    else void animate(page, at, SPRING);
  }, [at, page, still]);

  // Clipped to the chosen tab's height: the others are flat, so the page
  // scrolls only as far as the tab in view.
  return (
    <div ref={track} className="-mx-4 overflow-clip @md:-mx-8">
      <motion.div className="flex items-start" style={{ x }}>
        {SETTINGS_TABS.map((tab, index) => (
          <div
            key={tab}
            role="tabpanel"
            aria-label={LABELS[tab]}
            inert={index !== at}
            className={cn(
              'w-full shrink-0 px-4 text-sm @md:px-8',
              index !== at && 'h-0',
            )}
          >
            {pageOf(tab)}
          </div>
        ))}
      </motion.div>
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
          <Flip
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
            ]}
          />
        </Row>
        <Row
          label="Sounds"
          hint="Quiet sounds as commands run, from a key, a tap or a gesture."
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
          <Flip
            label="Switching user"
            value={settings.switching}
            onChange={(switching) => change({ switching })}
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
