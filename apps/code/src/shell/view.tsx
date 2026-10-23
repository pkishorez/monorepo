import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { AccountSwitcherView } from '@kestack/web-platform/account-switcher';
import * as places from '../places/index.ts';
import { ShellLive } from './actor.ts';
import { Keyboard } from './keyboard.tsx';
import * as Machine from './machine/index.ts';
import * as MachineList from './machines/index.ts';
import {
  Account,
  AccountSlot,
  LocalSignInDialog,
  SignedOut,
} from './sign-in/index.ts';

/*
 * The root page's View: the keyboard over everything, with Vim Mode and
 * the Bindings from Device State, and the Account Switcher handed down to
 * the headers. Then the chain as far as it has got: nothing while Device
 * State is read; signing in while nobody is; at the root, the Account's
 * Machines being found, or how to start one, with the Account Switcher in
 * the corner to sign out or switch; on a Machine, its page.
 */

export const ShellView = View.make(
  ShellLive,
  ({ _tag, root, model, state, props, children, send }) => {
    // Nothing is drawn while Device State is read.
    if (_tag === 'Reading') return <div {...root} />;
    const { account } = model;
    return (
      <div {...root}>
        <Keyboard
          vim={state.device.vim}
          bindings={state.device.bindings}
          onVimChange={(on) => send({ _tag: 'SetVim', on })}
        >
          <AccountSlot
            value={<AccountSwitcherView instance={children.account} />}
          >
            {account._tag !== 'SignedIn' ? (
              <SignedOut
                checking={account._tag === 'Checking'}
                problem={model.signInProblem}
                onSignIn={() => send({ _tag: 'SignIn' })}
              />
            ) : children.Machine ? (
              <Machine.View instance={children.Machine} />
            ) : props.route.notFound !== null ? (
              <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
                Nothing lives at this address.{' '}
                <Router.Link
                  to={places.root()}
                  className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                  Go to your Machine
                </Router.Link>
              </p>
            ) : (
              children.machines && (
                <>
                  <div className="fixed top-2 right-2">
                    <Account />
                  </div>
                  <MachineList.View instance={children.machines} />
                </>
              )
            )}
          </AccountSlot>
          <LocalSignInDialog />
        </Keyboard>
      </div>
    );
  },
);
