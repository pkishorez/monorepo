import { Button } from '@kstackz/web-toolkit/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kstackz/web-toolkit/components/dialog';
import {
  IosSteps,
  isIosSafari,
  useDisplayMode,
  useInstall,
} from '@kstackz/web-toolkit/pwa/extras';
import { usePwa } from '@kstackz/web-toolkit/pwa';
import { useEffect, useState } from 'react';
import { Row, Section } from './rows.tsx';

/**
 * Ledger as an app: installing it on the home screen, while it runs in a
 * browser tab, and the version this page runs, with a check for a newer one.
 */
export function AppSection() {
  const mode = useDisplayMode();
  return (
    <Section title="App">
      <div className="divide-y">
        {mode === 'browser' && <Install />}
        <Version />
      </div>
    </Section>
  );
}

// The browser's own install dialog where it has one; otherwise the steps.
function Install() {
  const { state, prompt } = useInstall();
  const [steps, setSteps] = useState<'ios' | 'menu'>();
  if (state._tag === 'Installed') return null;
  const install = async () => {
    if ((await prompt()) !== 'unavailable') return;
    setSteps(isIosSafari(navigator) ? 'ios' : 'menu');
  };
  return (
    <Row
      label="Install on home screen"
      hint="Ledger opens like an app, from your home screen, even offline."
    >
      <Button variant="outline" onClick={() => void install()}>
        Install
      </Button>
      <Dialog
        open={steps !== undefined}
        onOpenChange={(open) => !open && setSteps(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Ledger</DialogTitle>
            <DialogDescription>
              {steps === 'ios'
                ? 'Safari adds it from the Share menu.'
                : 'This browser adds it from its own menu.'}
            </DialogDescription>
          </DialogHeader>
          {steps === 'ios' ? (
            <IosSteps />
          ) : (
            <p className="text-sm">
              Open the browser’s menu and choose{' '}
              <strong className="font-medium">Install app</strong> or{' '}
              <strong className="font-medium">Add to Home screen</strong>.
            </p>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </Row>
  );
}

// When this page's build was deployed, written once the page has mounted,
// in the reader's own way.
function useDeployed(builtAt: string | null) {
  const [deployed, setDeployed] = useState<string>();
  useEffect(() => {
    if (builtAt === null) return;
    setDeployed(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(builtAt)),
    );
  }, [builtAt]);
  return deployed;
}

function Version() {
  const { status, version, checkForUpdate, applyUpdate } = usePwa();
  const deployed = useDeployed(version.builtAt);
  const [check, setCheck] = useState<'checking' | 'done'>();
  const hint = [deployed && `Deployed ${deployed}`, version.commit]
    .filter(Boolean)
    .join(' · ');
  const runCheck = async () => {
    setCheck('checking');
    await checkForUpdate();
    setCheck('done');
  };
  return (
    <Row label="Version" hint={hint || undefined}>
      {status._tag === 'UpdateReady' && (
        <Button onClick={() => void applyUpdate()}>Update now</Button>
      )}
      {status._tag === 'Updating' && <Button disabled>Updating…</Button>}
      {status._tag === 'Ready' && (
        <Button
          variant="outline"
          disabled={check === 'checking'}
          onClick={() => void runCheck()}
        >
          {check === 'checking'
            ? 'Checking…'
            : check === 'done'
              ? 'Up to date'
              : 'Check for updates'}
        </Button>
      )}
    </Row>
  );
}
