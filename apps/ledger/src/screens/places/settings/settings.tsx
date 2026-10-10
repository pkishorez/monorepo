import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kstackz/web-platform/components/alert-dialog';
import { Button } from '@kstackz/web-platform/components/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kstackz/web-platform/components/native-select';
import { Switch } from '@kstackz/web-platform/components/switch';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/web-platform/components/tabs';
import {
  ExternalLink,
  Moon,
  Sun,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import {
  GestureZone,
  type SwipeRelease,
  useSwipe,
} from '@kstackz/web-platform/input';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { appTheme, useAccounts, useGate, useSettings } from '../../../app.ts';
import { usePlace } from '../../../commands/index.ts';
import { useUser } from '../../../session/index.ts';
import { useMutations } from '../../../mutations/index.ts';
import { useCounts, useCurrency } from '../../../queries/index.ts';
import { CURRENCIES } from '../../../model/index.ts';
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

// Quick, as the sidebar settles: a tab takes the fingers' speed and lands.
const SPRING = { type: 'spring', visualDuration: 0.15, bounce: 0 } as const;

// A short drag or a light flick turns the tab.
const COMMIT = { distance: 60, velocity: 300 };

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
      <div className="mx-auto max-w-2xl px-4 pt-4 pb-28 @md:px-8 @md:py-8">
        <Tabs
          value={props.tab}
          onValueChange={(tab) => props.onTab(tab as SettingsTab)}
          className="gap-6"
        >
          {/* Stays at the top as the tab under it scrolls. */}
          <div className="sticky top-0 z-10 -mx-4 bg-background px-4 py-2 @md:-mx-8 @md:px-8">
            <TabsList variant="line" className="-ml-2">
              {SETTINGS_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
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
  // How far the fingers had gone when the swipe took the tabs: it starts
  // past where they landed, and the tabs move only from there.
  const from = useRef<number>(undefined);
  const dragging = useRef(false);

  const width = () => track.current?.offsetWidth || 1;
  // `velocity` is in tabs per second, so the spring carries on from the fingers.
  const settle = (to: number, velocity = 0) => {
    dragging.current = false;
    from.current = undefined;
    if (still) page.jump(to);
    else void animate(page, to, { ...SPRING, velocity });
  };
  const go = (to: number, velocity: number) => {
    const tab = SETTINGS_TABS[to];
    if (tab === undefined) return settle(at);
    settle(to, velocity);
    props.onTab(tab);
  };
  // A left swipe's speed moves toward later tabs; a right one's, earlier.
  const speed = (sign: 1 | -1, release?: SwipeRelease) =>
    release === undefined ? 0 : (sign * release.velocity) / width();
  const grab = () => {
    dragging.current = true;
    from.current = undefined;
    page.stop();
  };

  const left = useSwipe({
    direction: 'left',
    enabled: at < SETTINGS_TABS.length - 1,
    commit: COMMIT,
    onStart: grab,
    onCommit: (release) => go(at + 1, speed(1, release)),
    onCancel: (_, release) => settle(at, speed(1, release)),
  });
  const right = useSwipe({
    direction: 'right',
    enabled: at > 0,
    commit: COMMIT,
    onStart: grab,
    onCommit: (release) => go(at - 1, speed(-1, release)),
    onCancel: (_, release) => settle(at, speed(-1, release)),
  });
  const follow = () => {
    if (!dragging.current) return;
    const moved = left.offset.get() - right.offset.get();
    from.current ??= moved;
    page.set(at + (moved - from.current) / width());
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
  const [settings, change] = useSettings();
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
  const counts = useCounts();
  const currency = useCurrency();
  const { sample, clear, setCurrency } = useMutations();
  const { online, backend } = useGate();
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
        {counts.entries} entries in {counts.accounts} accounts,
        {backend === 'device'
          ? ' kept on this device only.'
          : ' kept on this device and in your account.'}
      </p>
      <div className="divide-y">
        <Row label="Currency">
          <NativeSelect
            value={currency}
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
        {counts.accounts === 0 && (
          <Button
            variant="outline"
            disabled={!online || busy}
            onClick={() => void act(() => sample(true))}
          >
            Load sample money
          </Button>
        )}
        {counts.accounts > 0 && (
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
  const { backend, setBackend } = useGate();
  const { manage } = useAccounts();
  return (
    <Section title="Users">
      <div className="divide-y">
        <Row
          label="Backend"
          hint="Cloud keeps your money for every device, with Google to sign in. Device keeps it on this device only, with anyone to sign in as. Each keeps its own users."
        >
          <Flip
            label="Backend"
            value={backend ?? 'cloud'}
            onChange={(next) => void setBackend(next)}
            options={[
              { value: 'cloud', label: 'Cloud' },
              { value: 'device', label: 'Device' },
            ]}
          />
        </Row>
        {backend === 'cloud' && (
          <Row
            label="Manage Google accounts"
            hint={`Where ${user.email} is signed in, and the apps it lets in, at the sign-in service.`}
          >
            <Button variant="outline" onClick={() => void manage()}>
              <ExternalLink aria-hidden="true" />
              Manage
            </Button>
          </Row>
        )}
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
  const { online } = useGate();
  const { all, signOutEveryone } = useAccounts();
  const count = all.length;
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
          <Button variant="destructive" onClick={() => void signOutEveryone()}>
            Sign out everyone
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
