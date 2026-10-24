import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import type { ReactNode } from 'react';
import { MachineListLive } from './actor.ts';

/*
 * What home shows in place of the projects while there is no Machine to
 * show them from: the Backend out of reach with nothing saved, or no
 * Machine at all, with how to start one. Nothing otherwise.
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
    // Never listed on this device: the page draws its skeleton meanwhile.
    if (model.machines === null && model.problem === null) return null;
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
            onClick={() => send({ _tag: 'ReloadAsked' })}
          >
            Try again
          </Button>
        </Screen>
      );
    if (model.machines.length > 0) return null;
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
          onClick={() => send({ _tag: 'ReloadAsked' })}
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
      className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-6 py-10"
    >
      {children}
    </main>
  );
}
