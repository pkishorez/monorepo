import { PortalScope } from '@kstackz/expo-platform/components/portal-scope';
import type { ReactNode } from 'react';
import { SignedIn } from '../../ledger';
import { Commands } from './commands';
import { Frame } from './frame';
import { Splash } from './splash';

/**
 * The whole app around a Place, for the open User: the Commands and the
 * Frame, under the Splash at launch. Until a User is open, the Expo
 * Platform shows where sign-in stands. A new User's Session starts the
 * Place afresh: everything inside SignedIn remounts on a Switch User.
 */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <>
      <SignedIn>
        <Commands>
          {/* The Sidebar and sheets open inside the Session and its Commands. */}
          <PortalScope>
            <Frame>{props.children}</Frame>
          </PortalScope>
        </Commands>
      </SignedIn>
      <Splash />
    </>
  );
}
