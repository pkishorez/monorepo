import { TriangleAlert } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { loginHref, signInFailure } from '../../api/index.ts';
import { ErrorPageLive } from './actor.ts';
import { LinkButton, Skeleton } from '../../ui/index.ts';
import { Frame } from '../frame/frame.tsx';
import { TaskHeading, TaskHeadingPlaceholder } from '../frame/heading.tsx';
import { Unready } from '../frame/unready.tsx';

/** A sign-in that failed: what happened, then the way back, keeping `return_to`. */
export const ErrorView = View.make(ErrorPageLive, ({ props }) => {
  if (props.status._tag !== 'Ready')
    return (
      <Unready status={props.status}>
        <div className="flex flex-col">
          <TaskHeadingPlaceholder
            title="Sign-in didn't finish"
            lead="Google sign-in didn't finish. Try again."
          />
          <Skeleton className="mt-8 h-11 rounded-lg" />
        </div>
      </Unready>
    );
  const { data, waited } = props.status;
  const { error, error_description, return_to } = props.query;
  const reason =
    signInFailure(error, error_description, data.brand.name) ??
    "There's no failed sign-in to explain. Sign in again to carry on.";
  return (
    <Frame data={data} waited={waited}>
      <div className="flex flex-col">
        <TaskHeading
          mark={<TriangleAlert aria-hidden="true" className="size-5" />}
          tone="warning"
          title="Sign-in didn't finish"
          lead={reason}
        />
        {error ? (
          <p className="mt-3 text-sm text-muted-fg">
            Code: <code className="font-mono break-all">{error}</code>
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-2">
          <LinkButton
            tone="primary"
            size="lg"
            href={loginHref(return_to, false, data)}
          >
            Try signing in again
          </LinkButton>
          {data.accounts.active ? (
            <LinkButton tone="ghost" size="lg" href="/">
              Go to your account
            </LinkButton>
          ) : null}
        </div>
      </div>
    </Frame>
  );
});
