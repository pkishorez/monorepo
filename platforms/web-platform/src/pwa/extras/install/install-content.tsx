import { Button } from '#components/ui/button';
import { ShareIcon, SquarePlusIcon } from '#lib/lucide';
import type { ReactNode } from 'react';

/** iOS Safari has no install API; the user adds the app from the Share sheet. */
export const IosSteps = (): ReactNode => (
  <ol className="flex flex-col gap-3 text-sm">
    <li className="flex items-center gap-3">
      <ShareIcon aria-hidden="true" className="size-5 shrink-0" />
      <span>
        Tap <strong className="font-medium">Share</strong> in the browser
        toolbar.
      </span>
    </li>
    <li className="flex items-center gap-3">
      <SquarePlusIcon aria-hidden="true" className="size-5 shrink-0" />
      <span>
        Choose <strong className="font-medium">Add to Home Screen</strong>.
      </span>
    </li>
  </ol>
);

/** Primary action last; on touch the buttons grow to a 44px hit area. */
export const InstallActions = (props: {
  readonly manual: boolean;
  readonly onInstall: () => void;
  readonly onDismiss: () => void;
}): ReactNode => {
  const size = 'min-h-11 touch-manipulation sm:min-h-0';
  return props.manual ? (
    <Button className={size} onClick={props.onDismiss}>
      Got it
    </Button>
  ) : (
    <>
      <Button variant="ghost" className={size} onClick={props.onDismiss}>
        Not now
      </Button>
      <Button className={size} onClick={props.onInstall}>
        Install
      </Button>
    </>
  );
};
