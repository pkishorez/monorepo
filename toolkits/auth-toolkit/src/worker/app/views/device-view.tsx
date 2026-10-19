import { CircleCheck, CircleX, MonitorSmartphone } from 'lucide-react';
import type { FormEvent } from 'react';
import { View } from '@kestack/kabuki/react';
import { deviceCodeFailure } from '../api/index.ts';
import { DeviceLive, approving, pendingRequest } from '../pages/index.ts';
import { Button, Notice, Skeleton } from '../ui/index.ts';
import { AccountPicker, PickerPlaceholder } from './account-picker.tsx';
import { Frame } from './frame.tsx';
import { GoogleButton } from './google-button.tsx';
import { TaskHeading, TaskHeadingPlaceholder } from './heading.tsx';
import { useRoot } from './root.ts';
import { Unready } from './unready.tsx';

/*
 * The Device Screen. A link with the code goes straight to "Sign in to
 * {app}?", the code looked up before the page arrives; a visit by hand asks
 * for the code first. Every failure says what happened and leaves a way on.
 */

/** `ABCDEFGH` reads as `ABCD-EFGH`, as most devices print it. */
const spaced = (code: string) =>
  /^[A-Z0-9]{8}$/i.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

function Entering({
  code,
  failure,
  product,
  checking,
  onCode,
}: {
  code: string;
  failure: string | null;
  product: string;
  /** The code entered is being looked up. */
  checking: boolean;
  onCode: (code: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = new FormData(event.currentTarget).get('code');
    onCode(typeof typed === 'string' ? typed : '');
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <TaskHeading
        mark={<MonitorSmartphone aria-hidden="true" className="size-5" />}
        title="Enter the code from your device"
        lead={`Your device shows a code when it asks to sign in to ${product}.`}
      />
      <label htmlFor="device-code" className="mt-8 text-sm font-medium">
        Code
      </label>
      <input
        id="device-code"
        name="code"
        defaultValue={code}
        autoComplete="off"
        autoCapitalize="characters"
        enterKeyHint="go"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        aria-invalid={failure ? true : undefined}
        aria-describedby={failure ? 'device-code-error' : undefined}
        placeholder="ABCD-EFGH"
        className="mt-2 h-12 rounded-lg bg-surface px-3.5 font-mono text-lg tracking-[0.12em] uppercase shadow-[0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-150 placeholder:text-faint placeholder:normal-case hover:shadow-[0_0_0_1px_var(--color-faint)] focus-visible:shadow-[0_0_0_2px_var(--color-ring)] aria-[invalid]:shadow-[0_0_0_1px_var(--color-danger)] aria-[invalid]:focus-visible:shadow-[0_0_0_2px_var(--color-danger)] focus-visible:outline-none motion-reduce:transition-none"
      />
      {failure ? (
        <div id="device-code-error" className="mt-3">
          <Notice>{failure}</Notice>
        </div>
      ) : null}
      <Button
        type="submit"
        tone="primary"
        size="lg"
        className="mt-6"
        busy={checking && 'Checking the code…'}
      >
        Continue
      </Button>
    </form>
  );
}

/** The question while it loads: its heading, the code, who approves, the answers. */
function DevicePlaceholder() {
  const last = useRoot().last.current;
  const product = last?.brand.name ?? 'your';
  return (
    <div className="flex flex-col">
      <TaskHeadingPlaceholder
        title="Sign in to acme-cli?"
        lead={`acme-cli is asking to use your ${product} account. Approve only if you started this yourself.`}
      />
      <Skeleton className="mt-8 h-20 rounded-xl" />
      <div className="mt-6 flex flex-col gap-3">
        <PickerPlaceholder count={last?.accounts.list.length ?? 1} />
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export const DeviceView = View.make(DeviceLive, (self) => {
  const { props, model, send } = self;
  if (props.status._tag !== 'Ready')
    return (
      <Unready status={props.status}>
        <DevicePlaceholder />
      </Unready>
    );
  const { data, waited, refreshing } = props.status;
  const { brand, lookup } = data;
  const hint = props.query.account;
  const device = <MonitorSmartphone aria-hidden="true" className="size-5" />;
  const found = pendingRequest(data);
  const entering = (failure: string | null) => (
    <Entering
      product={brand.name}
      code={
        (lookup?._tag === 'Found' ? lookup.userCode : undefined) ??
        props.query.code ??
        props.query.user_code ??
        ''
      }
      failure={failure}
      checking={refreshing}
      onCode={(code: string) => send({ _tag: 'CodeEntered', code })}
    />
  );

  const body = (() => {
    switch (self._tag) {
      case 'Ended':
        return entering(self.state.failure);
      case 'Done':
        return self.state.approved ? (
          <TaskHeading
            mark={<CircleCheck aria-hidden="true" className="size-5" />}
            tone="success"
            title={`You're signed in on ${self.state.app}`}
            lead="You can close this tab and go back to your device."
          />
        ) : (
          <TaskHeading
            mark={<CircleX aria-hidden="true" className="size-5" />}
            title="Sign-in cancelled"
            lead={`${self.state.app} wasn't signed in. You can close this tab.`}
          />
        );
      case 'Asking':
      case 'Answering':
      case 'SigningIn': {
        if (!found) {
          const failure = self._tag === 'Asking' ? self.state.failure : null;
          return entering(
            failure ??
              (lookup === null
                ? null
                : lookup._tag === 'Failed'
                  ? deviceCodeFailure(lookup.code, lookup.message)
                  : deviceCodeFailure('already_answered', '')),
          );
        }
        const { userCode } = found;
        const app = found.app ?? 'your device';
        const { chosen, missing } = approving(
          {
            accounts: data.accounts.list,
            active: data.accounts.active,
            chosen: model.chosen,
            overrode: model.overrode,
          },
          hint,
        );
        const answering = self._tag === 'Answering' ? self.state.approve : null;
        const signingIn = self._tag === 'SigningIn';
        const failure = self._tag === 'Asking' ? self.state.failure : null;
        const none = data.accounts.list.length === 0;
        return (
          <div className="flex flex-col">
            <TaskHeading
              mark={device}
              title={`Sign in to ${app}?`}
              lead={`${app} is asking to use your ${brand.name} account. Approve only if you started this yourself.`}
            />
            <div className="mt-8 rounded-xl bg-muted px-4 py-3">
              <p className="text-sm text-muted-fg">
                Check that your device shows this code
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.12em] tabular-nums select-all">
                {spaced(userCode)}
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {failure ? <Notice>{failure}</Notice> : null}
              {none ? (
                <>
                  <p className="text-muted-fg text-pretty">
                    Sign in to approve. You'll come back here to finish.
                  </p>
                  <GoogleButton
                    label={
                      missing ? `Sign in as ${missing}` : 'Continue with Google'
                    }
                    leaving={signingIn}
                    onClick={() =>
                      send({ _tag: 'SignInAsChosen', email: missing ?? '' })
                    }
                  />
                </>
              ) : missing ? (
                <>
                  <Notice tone="warning">
                    <strong className="font-medium">{missing}</strong> isn't
                    signed in on this browser.
                  </Notice>
                  <GoogleButton
                    label={`Sign in as ${missing}`}
                    leaving={signingIn}
                    onClick={() =>
                      send({ _tag: 'SignInAsChosen', email: missing })
                    }
                  />
                  {chosen ? (
                    <Button
                      tone="ghost"
                      size="lg"
                      disabled={signingIn}
                      onClick={() =>
                        send({ _tag: 'Overrode', userId: chosen.id })
                      }
                    >
                      <span className="truncate">
                        Approve as {chosen.email} instead
                      </span>
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <AccountPicker
                    label="Approve as"
                    accounts={data.accounts.list}
                    chosen={chosen}
                    disabled={answering !== null}
                    onChoose={(userId) => send({ _tag: 'Chosen', userId })}
                  />
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      tone="primary"
                      size="lg"
                      disabled={!chosen || answering === false}
                      busy={answering === true && 'Approving…'}
                      onClick={() =>
                        chosen && send({ _tag: 'Approved', userId: chosen.id })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      tone="secondary"
                      size="lg"
                      disabled={!chosen || answering === true}
                      busy={answering === false && 'Cancelling…'}
                      onClick={() =>
                        chosen && send({ _tag: 'Denied', userId: chosen.id })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }
    }
  })();

  return (
    <Frame data={data} waited={waited}>
      {body}
    </Frame>
  );
});
