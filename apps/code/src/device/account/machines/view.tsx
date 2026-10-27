import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import type { ReactNode } from 'react';
import { Voice } from './voice/index.ts';
import { fetching, MachinesLive } from './actor.ts';

/*
 * What home shows in place of the projects while there is no Machine to
 * show them from: Cloud Connect out of reach with no list kept on this
 * device, saying so and why, with a way to ask again; or no Machine at
 * all, with how to start one. Nothing otherwise, and nothing until the
 * list kept here has been read, so a kept list never follows either.
 */

/** The command that makes this computer one of the Account's Machines. */
export const serveCommand = () => 'npx @kestack/connect serve';

export const MachinesView = View.make(MachinesLive, ({ root, model, send }) => {
  const { value: machines, problem, keptRead } = model.list;
  // Never listed on this device: the page draws its skeleton meanwhile.
  if (!keptRead || (machines === null && problem === null)) return null;
  if (machines === null)
    return (
      <Screen root={root}>
        <h1 className="text-lg font-semibold">Can't reach Cloud Connect</h1>
        <p className="text-sm text-muted-foreground">
          Your Machines are listed by Cloud Connect, and this device has no list
          of them kept yet, so there is nothing to show until it answers.
        </p>
        <p className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-words">
          {problem}
        </p>
        <Button
          variant="outline"
          disabled={fetching(model)}
          onClick={() => send({ _tag: 'ReloadAsked' })}
        >
          {fetching(model) ? 'Trying…' : 'Try again'}
        </Button>
      </Screen>
    );
  if (machines.length > 0) return null;
  return (
    <Screen root={root}>
      <h1 className="text-lg font-semibold">No Machine yet</h1>
      <p className="text-sm text-muted-foreground">
        A Machine is a computer that runs your sessions. Run this on one, sign
        in as you are here, and it shows up in a few seconds:
      </p>
      <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
        {serveCommand()}
      </pre>
      <Button
        variant="outline"
        disabled={fetching(model)}
        onClick={() => send({ _tag: 'ReloadAsked' })}
      >
        {fetching(model) ? 'Looking…' : 'Look again'}
      </Button>
    </Screen>
  );
});

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

/**
 * Voice, around the screen the root page hands it through `Voice.Around`:
 * the Dictation, for every Draft and for Layout, whatever page is open.
 */
export const MachinesVoice = View.make(MachinesLive, ({ children }) => (
  <Voice.view instance={children.voice} />
));
