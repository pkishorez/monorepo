import { FileQuestion } from 'lucide-react';
import { LinkButton } from '../ui/index.ts';
import { Frame } from './frame/frame.tsx';
import { TaskHeading } from './frame/heading.tsx';
import { useRoot } from './root.ts';

/** A URL that names no page: what happened, and the way back. */
export function NotFound({ path }: { path: string }) {
  // Who is signed in is known only from a page drawn before this one: a
  // signed-in visitor who came here directly is sent on by the Login Screen.
  const signedIn = Boolean(useRoot().last.current?.accounts.active);
  return (
    <Frame data={null}>
      <div className="flex flex-col">
        <TaskHeading
          mark={<FileQuestion aria-hidden="true" className="size-5" />}
          title="There's no page here"
          lead={
            <>
              Nothing lives at{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-fg break-all">
                {path}
              </code>
              . The link may be old or mistyped.
            </>
          }
        />
        <LinkButton
          tone="primary"
          size="lg"
          href={signedIn ? '/' : '/login'}
          className="mt-8"
        >
          {signedIn ? 'Go to your account' : 'Sign in'}
        </LinkButton>
      </div>
    </Frame>
  );
}
