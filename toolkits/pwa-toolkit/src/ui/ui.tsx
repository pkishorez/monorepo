import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from 'kui-toolkit/components/ui/sheet';
import { createToastManager, Toaster } from 'kui-toolkit/components/ui/toast';
import { WifiOffIcon } from 'kui-toolkit/lucide';
import { type ReactNode, useId, useState } from 'react';
import { useOnline, usePwaInstall, usePwaUpdate } from '../react/index.js';
import { InstallActions, IosSteps } from './install-content.js';
import { useMediaQuery } from './media-query.js';
import { useUpdateToast } from './update-toast.js';

/**
 * Persistent toast while an update is Available; accepting applies it.
 * Renders its own toast viewport, so it does not need the app's `Toaster`.
 */
export const UpdatePrompt = (props: {
  readonly message?: string;
  readonly acceptLabel?: string;
}): ReactNode => {
  const { state, apply } = usePwaUpdate();
  const [manager] = useState(createToastManager);
  useUpdateToast(
    manager,
    state,
    {
      message: props.message ?? 'A new version is available.',
      acceptLabel: props.acceptLabel ?? 'Reload',
    },
    apply,
  );
  return <Toaster toastManager={manager} />;
};

/**
 * Bottom sheet on small screens, a corner card on larger ones; manual steps
 * on iOS Safari. Closing it any way counts as a dismissal (30 days).
 */
export const InstallPrompt = (props: {
  readonly title?: string;
  readonly description?: string;
}): ReactNode => {
  const { state, prompt, dismiss } = usePwaInstall();
  const compact = useMediaQuery('(max-width: 40rem)');
  const titleId = useId();
  if (state._tag !== 'Available' && state._tag !== 'ManualIos') return null;

  const manual = state._tag === 'ManualIos';
  const title = props.title ?? 'Install this app';
  const description =
    props.description ??
    'Add it to your home screen for quick access, even offline.';
  const actions = (
    <InstallActions
      manual={manual}
      onInstall={() => void prompt()}
      onDismiss={dismiss}
    />
  );

  if (compact) {
    return (
      <Sheet open onOpenChange={(open) => !open && dismiss()}>
        {/* No X: its tap target is under 44px, and the footer's
            "Not now" / "Got it" already close the sheet. */}
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {manual && (
            <div className="px-4">
              <IosSteps />
            </div>
          )}
          <SheetFooter>{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  // Not modal: an unasked-for invitation must not take focus from the page.
  return (
    <aside
      aria-labelledby={titleId}
      className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 w-full max-w-sm animate-in duration-200 ease-out fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <Card size="sm" className="shadow-lg">
        <CardHeader>
          <CardTitle id={titleId}>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {manual && (
          <CardContent>
            <IosSteps />
          </CardContent>
        )}
        <CardFooter className="justify-end gap-2">{actions}</CardFooter>
      </Card>
    </aside>
  );
};

/**
 * Shown while offline. The live region is always rendered so screen readers
 * announce the change. It stacks above sheets and their backdrop (z-50).
 */
export const OfflineIndicator = (props: {
  readonly message?: string;
}): ReactNode => {
  const online = useOnline();
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-60 flex justify-center"
    >
      {!online && (
        <span className="inline-flex animate-in items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md duration-200 ease-out fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <WifiOffIcon aria-hidden="true" className="size-3.5" />
          {props.message ?? "You're offline"}
        </span>
      )}
    </div>
  );
};
