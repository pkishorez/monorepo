import { Button } from '@kestack/web-platform/ui/components/button';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { usePwa, useStoragePersistence } from '@kestack/web-platform/pwa';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../../../../../ui/controls/notice/index.ts';
import {
  Row,
  Section,
  Title,
} from '../../../../../../../../ui/controls/settings/index.ts';
import { clearAndReload } from './store.ts';

/*
 * About: this app, as this browser runs it, in two Sections of one Row
 * each. Version: when this build was made and its commit, and a button
 * to check for a newer one, or to move to it once it is downloaded.
 * Storage: how much this browser holds for the app, and a fresh start,
 * asked first, that deletes it all and reloads. Under them, centred, the
 * stack the app is built on.
 */

/** Touch gets a finger's height, a keyboard the compact one; on a phone, the column's width. */
const BUTTON = 'h-11 keyboard:h-8 max-sm:w-full';

/** A Row whose button, on a phone, goes under its words. */
const STACKED = 'max-sm:flex-col max-sm:items-stretch max-sm:gap-3';

/** A size in bytes as a person reads it. */
export const size = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/** How much this browser holds for the app: undefined while asked, null where it won't say. */
function useUsage() {
  const { estimate } = useStoragePersistence();
  const [usage, setUsage] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    void estimate().then(
      (found) => mounted && setUsage(found === null ? null : found.usage),
    );
    return () => {
      mounted = false;
    };
  }, [estimate]);
  return usage;
}

/** The build's date, in the reader's own words, so only after mount; null before, or with none. */
function useBuilt(builtAt: string | null) {
  const [built, setBuilt] = useState<string | null>(null);
  useEffect(() => {
    if (builtAt === null) return;
    setBuilt(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(builtAt),
      ),
    );
  }, [builtAt]);
  return built;
}

/** This build, and a newer one checked for and moved to. */
function VersionRow() {
  const { status, version, checkForUpdate, applyUpdate } = usePwa();
  const built = useBuilt(version.builtAt);
  const [check, setCheck] = useState<'idle' | 'checking' | 'newest'>('idle');

  const checkNow = async () => {
    setCheck('checking');
    await checkForUpdate();
    setCheck('newest');
  };

  const control =
    status._tag === 'UpdateReady' || status._tag === 'Updating' ? (
      <Button
        type="button"
        size="sm"
        className={BUTTON}
        disabled={status._tag === 'Updating'}
        onClick={() => void applyUpdate()}
      >
        {status._tag === 'Updating' && <Spinner />}
        Update now
      </Button>
    ) : status._tag === 'Ready' ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={BUTTON}
        disabled={check === 'checking'}
        onClick={() => void checkNow()}
      >
        {check === 'checking' ? (
          <Spinner />
        ) : check === 'newest' ? (
          <CheckIcon aria-hidden className="text-positive" />
        ) : null}
        {check === 'newest' ? 'Up to date' : 'Check for updates'}
      </Button>
    ) : undefined;

  const words =
    status._tag === 'UpdateReady' || status._tag === 'Updating'
      ? 'A new version is ready.'
      : version.builtAt === null && version.commit === null
        ? 'Development build.'
        : null;

  return (
    <Row id="version" name="Code app" control={control} className={STACKED}>
      {words ?? (
        <span className="tabular-nums">
          {version.builtAt !== null &&
            (built === null ? (
              <Skeleton className="inline-block h-3.5 w-20 align-middle" />
            ) : (
              built
            ))}
          {version.builtAt !== null && version.commit !== null && ' · '}
          {version.commit !== null && (
            <code className="font-mono text-xs">
              {version.commit.slice(0, 7)}
            </code>
          )}
        </span>
      )}
    </Row>
  );
}

/** What this browser holds, and all of it deleted, asked first, then a reload. */
function StorageRow() {
  const usage = useUsage();
  const open = Confirm.useOpen();
  const [asked, setAsked] = useState(false);
  const [clearing, setClearing] = useState(false);
  const held =
    usage === undefined ? (
      <Skeleton className="inline-block h-3.5 w-14 align-middle" />
    ) : usage === null ? (
      'Saved in this browser.'
    ) : (
      <span className="tabular-nums">{size(usage)} saved in this browser.</span>
    );
  return (
    <>
      <Row
        id="storage"
        name="Clear all data"
        className={STACKED}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              BUTTON,
              'text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
            onClick={() => open(() => setAsked(true))}
          >
            Clear…
          </Button>
        }
      >
        {held}
      </Row>
      <Confirm.Dialog
        open={asked}
        title="Clear all data?"
        description="Drafts and settings on this device are deleted, then the app reloads. Your sessions are safe, and you stay signed in."
        problem={null}
        busy={clearing}
        keep="Cancel"
        confirm="Clear and reload"
        onClose={() => setAsked(false)}
        onConfirm={() => {
          setClearing(true);
          void clearAndReload();
        }}
      />
    </>
  );
}

/** The stack the app is built on: its logo, the word beside it, a link to its docs. */
function PoweredBy() {
  return (
    <a
      href="https://docs.kishore.app"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by ke stack"
      className="focus-ring mt-4 flex w-fit items-center gap-2 self-center rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      Powered by
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <img
          src="/ke-stack.svg"
          alt=""
          width={20}
          height={20}
          loading="lazy"
          // Black on white in the light theme, flipped to white on black in the dark.
          className="size-5 rounded-[5px] dark:invert"
        />
        stack
      </span>
    </a>
  );
}

export function AboutView() {
  return (
    <section aria-labelledby="about" className="flex flex-col gap-8">
      <Title id="about" name="About" />
      <Section name="Version">
        <VersionRow />
      </Section>
      <Section name="Storage">
        <StorageRow />
      </Section>
      <PoweredBy />
    </section>
  );
}
