import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type { ReactNode } from 'react';
import { MachineListLive } from './actor.ts';

/*
 * What the root shows while it is on no Machine: finding the Account's
 * Machines, the Backend out of reach with nothing saved, or no Machine at
 * all, with how to start one. With a list, the Machine List opens one, and
 * this shows only a moment.
 */

const local = import.meta.env.VITE_AUTH_LOCAL === 'true';
const backend = import.meta.env.VITE_MACHINES_URL;

/** The command that makes this computer one of the Account's Machines. */
export const serveCommand = (email: string | null) =>
  local
    ? `npx @kestack/ai-toolkit serve --as ${email ?? '<email>'} --backend ${backend}`
    : 'npx @kestack/ai-toolkit serve';

export const MachineListView = View.make(
  MachineListLive,
  ({ root, model, props, send }) => {
    if (model.machines === null && model.problem === null)
      return (
        <Screen root={root}>
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Finding your Machines…
          </p>
        </Screen>
      );
    if (model.machines === null)
      return (
        <Screen root={root}>
          <h1 className="text-lg font-semibold">
            Your Machines can't be listed
          </h1>
          <p className="text-sm text-muted-foreground">{model.problem}</p>
          <Button
            variant="outline"
            disabled={model.fetching}
            onClick={() => send({ _tag: 'Refresh' })}
          >
            Try again
          </Button>
        </Screen>
      );
    if (model.machines.length > 0)
      return (
        <Screen root={root}>
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Opening your Machine…
          </p>
        </Screen>
      );
    return (
      <Screen root={root}>
        <h1 className="text-lg font-semibold">No Machine yet</h1>
        <p className="text-sm text-muted-foreground">
          A Machine is a computer that runs your sessions. Run this on one, sign
          in as you are here, and it shows up in a few seconds:
        </p>
        <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
          {serveCommand(props.email)}
        </pre>
        <Button
          variant="outline"
          disabled={model.fetching}
          onClick={() => send({ _tag: 'Refresh' })}
        >
          {model.fetching ? 'Looking…' : 'Look again'}
        </Button>
      </Screen>
    );
  },
);

function Screen({
  root,
  children,
}: {
  readonly root: object;
  readonly children: ReactNode;
}) {
  return (
    <main
      {...root}
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-start justify-center gap-4 px-6"
    >
      {children}
    </main>
  );
}
