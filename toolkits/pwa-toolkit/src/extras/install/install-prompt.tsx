import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kstackz/ui-toolkit/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@kstackz/ui-toolkit/components/ui/sheet';
import { type ReactNode, useId } from 'react';
import { InstallActions, IosSteps } from './install-content.js';
import { useInstall } from './install.js';
import { useMediaQuery } from './media-query.js';

/**
 * Bottom sheet on small screens, a corner card on larger ones; manual steps
 * on iOS Safari. Closing it any way counts as a dismissal (30 days).
 */
export const InstallPrompt = (props: {
  readonly title?: string;
  readonly description?: string;
}): ReactNode => {
  const { state, prompt, dismiss } = useInstall();
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
