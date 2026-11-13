import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/card';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '#components/drawer';
import { type ReactNode, useId } from 'react';
import { InstallActions, IosSteps } from './install-content.js';
import { useInstall } from './install.js';
import { useMediaQuery } from './media-query.js';

/**
 * A Drawer from the bottom on small screens, a corner card on larger ones;
 * manual steps on iOS Safari. Closing it any way, a swipe down and a tap
 * outside included, counts as a dismissal (30 days).
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
      <Drawer open onOpenChange={(open) => !open && dismiss()}>
        <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          {manual && (
            <div className="px-4 pt-4">
              <IosSteps />
            </div>
          )}
          <DrawerFooter className="pt-4">{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
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
